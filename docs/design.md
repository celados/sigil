# sigil — 设计

Agent 友好的图标包管理器。像 `pnpm` 管依赖一样管图标:声明在 manifest 里,
codegen 是 manifest 的纯投影。

```
sigil sources                         # 列出支持的 source
sigil use lucide svgl                  # 声明项目用哪些库 + vendor 到本地
sigil search house                     # 默认只搜已声明的库:本地、离线
sigil search github --all              # 全局发现(iconify 索引,选库阶段用)
sigil add lucide/house+menu            # 写入 icons.json
sigil etch -o src/icons.tsx --jsx react  # 生成组件模块
sigil etch -o src/icons.tsx --jsx react --atlas  # 组件模块 + 图集预览组件
sigil etch -o public/svg               # 无 --jsx → dump 独立 .svg 文件
```

## 心智模型:库优先

实际需求是**锁库工作**:应用 icon 选一个库(如 lucide),brand icon 选一个
库(如 svgl),很少混用更多。所以工作流是先声明库、再在已声明的库内工作:

| sigil     | 包管理器类比      | 职责                                                           |
| --------- | ----------------- | -------------------------------------------------------------- |
| `sources` | registry/catalog  | 列出内置可 vendor 的 source 与 Iconify fallback                |
| `use`     | 写 `dependencies` | 声明库 + **provision**(vendor 到本地)                          |
| `search`  | `npm search`      | 默认作用域 = 已 use 的库(本地、离线);`--all` 全局发现          |
| `add`     | `pnpm add`        | 校验存在性后写入 `icons.json`;未 use 的库自动声明(stderr 提示) |
| `etch`    | `install/codegen` | 读 manifest → 解析 → 生成文件,**纯投影**                       |

锁库之后日常 search/add/etch **完全离线**;`api.iconify.design` 只在
`--all` 发现和长尾库兜底时出场。

`sources` 是非交互的能力发现命令;裸 `use` 也打印同一份列表,作为用户不确定
要声明哪个库时的低摩擦入口。不要把支持列表拼进 `list`: `list` 表达当前
manifest 状态,混入全局 catalog 会削弱脚本输出的信号。

### Provision 触发矩阵

| 命令           | 行为                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `use`          | **主触发**:显式声明 + clone                                             |
| `add` / `etch` | ensure(幂等恢复)——新 checkout 跑 etch 自动重建 vendor,同 `pnpm install` |
| `search`       | **绝不 clone**(未 vendor → 走 API)                                      |

`remove <set>`(裸 set 名,无 `/`)删除整个库声明。

不做 lockfile。图标库几乎只增不删,上游漂移是小概率事件;`etch` 解析失败时
列出缺失项并以非零退出,让用户处理(改名或 `sigil remove`)。失败是原子的:
**有任何缺失则不写任何文件**。

## Manifest: `icons.json`

人和 agent 都可直接编辑,`add`/`remove` 只是便捷写入器。

顶层按 set 分组——一个 set 出现在 manifest 里(哪怕 icons 为空)就代表
"项目使用这个库"(`use` 的产物);variant/prefix 是 **set 级设计决策**:

```jsonc
{
	"ph": {
		"variant": "duotone", // 不填 = adapter 默认(regular);切全项目 weight 改这一行
		"icons": ["house", "airplane-taxiing"],
	},
	"lucide": {
		"icons": ["house", { "name": "menu", "as": "Hamburger" }], // 同库撞名用 as
	},
	"svgl": { "icons": [] }, // 已 use,待添加 —— 合法状态
}
```

- ref 语法统一为 `set/name`(CLI 与 manifest 一致)。`add` 的极简 DSL
  一句话学会:**`+` 分图标,`,`(或空格)分库**——
  `add lucide/a+b,mdi/c`。每个 `,` 段自包含(必须带 `set/`),
  无"继承上文 set"的隐式规则。
- **variant 是 set 级的一个字符串,不是图标身份的一部分**。洞察:一个应用
  只会用一种 variant,不存在运行时切 weight 的需求。manifest 存 base 名,
  resolve 时拼后缀;规则全库统一(镜像 Iconify 约定):variant 等于 adapter
  的 `defaultVariant` 时无后缀,否则 `name-{variant}`。adapter 只声明
  defaultVariant 一个字符串,无泛化接口。
- **组件名用 base 名**(`PhHouse`,variant 永不进组件名):切 variant =
  改 manifest 一行 + re-etch,所有 import 零改动。
- **组件名前缀留给 adapter**(react-icons 风格):`lucide → Lu → LuHouse`、
  `simple-icons → Si`。set 级 `prefix` 字段可覆盖(如统一 `Icon` 风格)。
  prefix spec 只有一条:**首字母必须大写**。跨库重名天然不撞。
- iconify fallback 的前缀推导:单词取头两字母(`lucide → Lu`),多段取各段
  首字母(`icon-park-outline → Ipo`,与 `icon-park-solid → Ips` 区分)。
- `as` 替换 PascalCase(name) 部分,前缀保留(`LuHamburger`)。
- 撞名在 `add` 和 `etch` 两处都直接报错,绝不静默覆盖。
- 错误 variant → etch 原子失败,报 effective 名(`ph/house-nonexistent`)。

## Vendoring:add 即 install

像包管理器把依赖装进 node_modules 一样,`add` 把图标库 vendor 到本地:

- 专属 adapter(lucide、heroicons…)在 `add`/`etch` 时把上游仓库
  **blobless sparse shallow clone** 到 `node_modules/.icons/<set>/`
  (只拉图标目录的对象,秒级、幂等、随 node_modules 被 gitignore)。
- 此后 search/resolve/etch 全走本地文件:快、离线、且能搜到 API 索引
  隐藏的图标(如 deprecated 项)和本地 tags 元数据。
- 新 checkout 的项目跑 `etch` 会自动重新 vendor——语义同 `pnpm install`。
- iconify API 的定位是**发现工具 + 长尾兜底**,不在主路径上:
  `search --all` 全局发现用它;未注册专属 adapter 的 set(mdi、carbon…)
  的 add/etch 兜底用它。两边对同一 set 的图标命名一致(adapter 镜像
  Iconify 命名),ref 完全可移植。
- 多个 set 的 vendor 与 resolve 全部并发(按 set 分组 `Promise.all`)。
- 多进程同时 vendor 同一 set:clone 到 pid 独占临时目录后原子 rename,
  输家丢弃自己的副本。
- 专属 adapter 的 search 只列 base 名(variant 是 set 级配置,展开变体
  只会刷屏把别的命中挤出 limit)。

## 接口一:IconSource(图标库适配器)

输入侧的扩展点。每个流行图标库一个专属 adapter(vendored、本地、元数据
丰富),`iconify` fallback 覆盖长尾;公司私有图标集、本地 SVG 目录、
Figma 都实现同一接口。

```ts
export type IconRef = { set: string; name: string }

export type SearchResult = {
	hits: IconRef[]
	total: number
	// set → 展示信息,search 输出按 set 分组时使用
	sets: Record<string, { title: string; license?: string }>
}

export type ResolvedIcon = {
	ref: IconRef
	// 归一化后的 <svg> 内部内容:alias/transform 已展开,ID 已唯一化。
	// 各库的 fill/stroke 语义(lucide 描边、simple-icons 填充)由 adapter
	// 保留在 body 内,渲染层不做任何猜测。
	body: string
	viewBox: string // "0 0 24 24"
	license?: { title?: string; spdx?: string; url?: string }
}

export interface IconSource {
	readonly id: string
	// set → 组件名前缀(lucide → Lu);spec:首字母必须大写
	prefix(set: string): string
	// 该库"无后缀"的 variant 名(ph → regular);无 variant 概念的库不声明
	readonly defaultVariant?: string
	// vendor 数据到 node_modules/.icons/<set>(幂等);API 型 adapter 不实现
	vendor?(): Promise<void>
	vendored?(): boolean
	search(
		query: string,
		opts?: { set?: string; limit?: number },
	): Promise<SearchResult>
	// 批量解析;缺失不抛错而是报告,由调用方决定失败策略
	resolve(refs: IconRef[]): Promise<{
		icons: ResolvedIcon[]
		missing: IconRef[]
	}>
}
```

归一化是 adapter 的责任,渲染层是哑的。`iconify` adapter 内部:

- `search` → `GET api.iconify.design/search?query=&prefix=&limit=`
- `resolve` → `GET /{set}.json?icons=a,b`,然后
  `getIconData`(展开 alias/transform)→ `iconToSVG`(算 viewBox/body)→
  `replaceIDs`(多图标同文档时 `<defs>` ID 不冲突)。
  全部来自 `@iconify/utils`,不手搓 SVG。

## 接口二:Renderer(输出格式)

输出侧的扩展点。返回相对路径的文件列表,统一"单模块"和"逐文件"两种形状。

```ts
export type NamedIcon = ResolvedIcon & { componentName: string }

export type RenderedFile = { path: string; content: string }

export interface Renderer {
	readonly id: string // 'react' | 'solid' | 'tsrx' | 'svg'
	// 模块型 renderer 的默认文件名('icons.tsx');null 表示逐图标输出
	readonly defaultFile: string | null
	render(icons: NamedIcon[]): RenderedFile[]
}
```

`-o` 的语义由此变得简单:format 来自 `--jsx` flag,path 只管位置——

- `--jsx react` + `-o src/icons.tsx` → 单文件模块
- `--jsx react` + `-o src/icons`(目录/无扩展名)→ 自动补 `/icons.tsx`
- 无 `--jsx` + `-o public/svg` → svg renderer,逐图标 `github.svg`…

## Codegen 规则

### 共享外壳

每个模块一个 `Icon` 外壳 + 逐图标导出。外壳保持中性(只有
xmlns/尺寸/viewBox),**不写死 fill/stroke**——描边型(lucide)和填充型
(simple-icons)的语义都在 body 里,写死外壳会把描边图标渲染成色块。

```tsx
// react 模板示意
export type IconProps = React.SVGProps<SVGSVGElement> & {
	size?: number | string
}

const Icon = ({ size = '1em', ...props }: IconProps & { viewBox: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		height={size}
		{...props}
	/>
)

// lucide/github · ISC
export const LuGithub = (props: IconProps) => (
	<Icon viewBox="0 0 24 24" {...props}>
		<path d="..." />
	</Icon>
)
```

props 展开在默认值**之后**,保证 `size`/`className`/任意 SVG 属性可覆盖
(better-icons 把顺序写反导致 props 全部失效,引以为戒)。

### React 属性转换

body 是原生 SVG,React JSX 需要属性改名。规则是通用的,不维护枚举表:

- kebab-case → camelCase(`stroke-width` → `strokeWidth`)
- 例外:`data-*`、`aria-*` 保持原样
- `class` → `className`;`xlink:href` → `xlinkHref`

### Solid

Solid JSX 接受原生 SVG 属性名,body 原样内联;`size` 用 `splitProps` 拆出。

### TSRX(`--jsx tsrx`,ripple-ts → Ripple)

输出 `.tsrx` 模块。依据 [tsrx.dev](https://tsrx.dev) 规格:Ripple 用原生 host
属性(`class`/`stroke-width`),且"TSRX keeps authored attributes as written"
——所以 body 与 Solid 一样原样内联,不改名。组件是普通 TS 函数返回 JSX,
参数用 `&{ size, ...props }` 惰性解构保 Ripple 的细粒度响应,`size ?? '1em'`
写在 JSX 属性表达式里(避开未在文档展示的"惰性解构默认值",且属性表达式
在 Ripple 下仍被追踪)。tsrx DSL 仍在演进,变更只需改这一个 renderer。

### svg(无 `--jsx`)

逐图标输出完整 `.svg` 文件(`iconToHTML` 包装),文件头带 license 注释。

## CLI(argc)

用 [argc](https://github.com/ethan-huo/argc) schema-first 定义,白送
`--schema`(agent 自描述)、`--input` JSON、shell completions。

```
globals: --manifest <path>   # 默认 ./icons.json

sigil sources [--json]
sigil use <sets...> [--variant X] [--prefix Y]   # flags 仅允许单个 set
sigil search <query> [--set lucide] [--all] [--limit 64] [--json]
sigil add <refs...> [--as <Name>]     # --as 仅允许单个 ref;DSL: set/a+b,set2/c
sigil remove <refs...>                # 裸 set 名删整个库
sigil list [--json]
sigil etch --output <path> [--jsx react|solid|tsrx] [--atlas]
```

- **不设 alias**(rm/ls/-o 这类短形式):使用者是 agent,`output` 和 `o`
  都是一个 token,alias 是纯噪音。
- stdout 纪律:结果走 stdout(`--json` 时是纯 JSON),诊断走 stderr。
- search 路由:`--set` 命中已 vendor 的专属 adapter → 本地搜索;
  否则 iconify API 全局发现。

## 非目标

- lockfile / 版本钉死(上游近似 append-only,etch 失败兜底足够)
- 运行时图标组件(那是 `@iconify/react` 的事;sigil 产出的是源码)
- SVG 优化(Iconify 数据已优化过;SVGO 属于过度机械)
- MCP server(CLI + `--schema` 对 agent 已足够;需要时再包一层)

## 已知尾巴

见 `.agents/backlog.md`:resolve 结果缓存(目前每次 etch 都打 API)、
动画图标集(line-md)的 `<style>` 块在 react 转换下的兼容性、ripple renderer。
