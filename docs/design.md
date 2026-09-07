---
type: Reference
title: Sigil design
description: Architecture and output contracts for the Sigil icon package manager.
---

# sigil — 设计

Agent 友好的图标包管理器。像 `pnpm` 管依赖一样管图标:声明在 manifest 里,
codegen 是 manifest 的纯投影。

```
sigil sources '{}'                         # 列出支持的 source
sigil use "{ sets: ['lucide', 'svgl'] }"    # 声明库 + vendor 到本地
sigil search "{ query: 'house' }"           # 默认只搜已声明库:本地、离线
sigil search "{ query: 'github', all: true }" # 全局发现(iconify 索引)
sigil add "{ refs: ['lucide/house', 'lucide/menu'] }"
sigil etch "{ output: 'public/icons.css', format: 'css' }"
sigil etch "{ output: 'src/icons.tsx', jsx: 'react' }"
sigil etch "{ output: 'src/icons.tsx', jsx: 'react', atlas: true }"
sigil etch "{ output: 'src/icons', jsx: 'octane', atlas: true }"
sigil etch "{ output: 'src/icons', jsx: 'tsrx', atlas: true }"
sigil etch "{ output: 'public/svg' }"       # 无 jsx → dump 独立 .svg 文件
```

## 心智模型:库优先

实际需求是**锁库工作**:应用 icon 选一个库(如 lucide),brand icon 选一个
库(如 svgl),很少混用更多。所以工作流是先声明库、再在已声明的库内工作:

| sigil     | 包管理器类比      | 职责                                                           |
| --------- | ----------------- | -------------------------------------------------------------- |
| `sources` | registry/catalog  | 列出内置可 vendor 的 source 与 Iconify fallback                |
| `use`     | 写 `dependencies` | 声明库 + **provision**(vendor 到本地)                          |
| `search`  | `npm search`      | 默认作用域 = 已 use 的库(本地、离线);`all: true` 全局发现      |
| `add`     | `pnpm add`        | 校验存在性后写入 `icons.json`;未 use 的库自动声明(stderr 提示) |
| `etch`    | `install/codegen` | 读 manifest → 解析 → 生成文件,**纯投影**                       |

锁库之后日常 search/add/etch **完全离线**;`api.iconify.design` 只在
`all: true` 发现和长尾库兜底时出场。

`sources` 是非交互的能力发现命令;空 `use` 输入也打印同一份列表,作为不确定
要声明哪个库时的低摩擦入口。不要把支持列表拼进 `list`: `list` 表达当前
manifest 状态,混入全局 catalog 会削弱脚本输出的信号。

### Provision 触发矩阵

| 命令           | 行为                                                    |
| -------------- | ------------------------------------------------------- |
| `use`          | **主触发**:显式声明 + clone                             |
| `add` / `etch` | ensure(幂等恢复)——cache 缺失或超过一天时自动重新 vendor |
| `search`       | **绝不 clone**(未 vendor → 走 API)                      |

`remove <set>`(裸 set 名,无 `/`)删除整个库声明。

不做 lockfile。图标库几乎只增不删,上游漂移是小概率事件;`etch` 解析失败时
列出缺失项并以非零退出,让用户处理(改名或 `sigil remove`)。失败是原子的:
**有任何缺失则不写任何文件**。

## Manifest: `icons.json`

人和 agent 都可直接编辑,`add`/`remove` 只是便捷写入器。

顶层按 set 分组——一个 set 出现在 manifest 里(哪怕 icons 为空)就代表
"项目使用这个库"(`use` 的产物);variant/prefix/cssMode 是 **set 级设计决策**:

```jsonc
{
	"ph": {
		"variant": "duotone", // 不填 = adapter 默认(regular);切全项目 weight 改这一行
		"icons": ["house", "airplane-taxiing"],
	},
	"lucide": {
		"icons": ["house", { "name": "menu", "as": "Hamburger" }], // 同库撞名用 as
	},
	"private-icons": {
		"cssMode": "image", // 长尾/私有 source 的颜色模型必须显式决定
		"icons": ["logo"],
	},
	"svgl": { "icons": [] }, // 已 use,待添加 —— 合法状态
}
```

- ref 语法统一为 `set/name`(CLI 与 manifest 一致)。`add`/`remove` 的输入是
  显式字符串数组;`+`、`,`、`:` 等分隔符 DSL 全部不存在,调用方也不需要
  依赖 shell 对多参数的拆分行为。
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
- **CSS 颜色模型也是 set 级决策**:bundled monochrome adapter 默认
  `mask`,`svgl` 默认 `image`;长尾 Iconify/private source 不做猜测,
  必须通过 `cssMode` 显式覆盖。
- 撞名在 `add` 和 `etch` 两处都直接报错,绝不静默覆盖。
- 错误 variant → etch 原子失败,报 effective 名(`ph/house-nonexistent`)。

## Vendoring:add 即 install

像包管理器安装依赖一样,`add` 把图标库 vendor 到本地——但落在 user 级
cache 而非项目目录:

- 专属 adapter(lucide、heroicons…)在 `add`/`etch` 时把上游仓库
  **blobless sparse shallow clone** 到
  `$XDG_CACHE_HOME/sigil/icons/<set>/`(默认 `~/.cache/sigil/icons/`,
  只拉图标目录的对象,秒级完成)。cache 全机共享:工具可在任意目录工作,
  不在项目里留下 `node_modules`,删掉 cache 目录也只是下次 vendor 重建。
- **新鲜度按天控制**:clone 成功写 `<set>/.sigil-timestamp`,超过一天
  `vendor()` 重新 clone(旧目录整个废弃);stamp 缺失一律视为过期。
  过期判断只在 `use`/`add`/`etch` 的写路径执行——`search` 保持只读,
  本地有数据就用本地,绝不触发网络。
- 此后 search/resolve/etch 全走本地文件:快、离线、且能搜到 API 索引
  隐藏的图标(如 deprecated 项)和本地 tags 元数据。
- iconify API 的定位是**发现工具 + 长尾兜底**,不在主路径上:
  `all: true` 全局发现用它;未注册专属 adapter 的 set(mdi、carbon…)
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
	// CSS 输出的安全默认;颜色模型不明时不声明
	cssMode?(set: string): 'mask' | 'image'
	// 该库"无后缀"的 variant 名(ph → regular);无 variant 概念的库不声明
	readonly defaultVariant?: string
	// vendor 数据到全局 cache(幂等,stamp 过期即刷新);API 型 adapter 不实现
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
export type NamedIcon = ResolvedIcon & {
	componentName: string
	fileName: string
	cssMode?: 'mask' | 'image'
}

export type RenderedFile = { path: string; content: string }

export interface Renderer {
	readonly id: string // 'css' | 'react' | 'solid' | 'octane' | 'tsrx' | 'svg'
	// 模块型 renderer 的默认文件名('icons.tsx');null 表示逐图标输出
	readonly defaultFile: string | null
	render(icons: NamedIcon[]): RenderedFile[]
}
```

`output` 的语义由此变得简单:format 来自 `format`/`jsx`,path 只管位置——

- `jsx: 'react'` + `output: 'src/icons.tsx'` → 单文件模块
- `jsx: 'react'` + `output: 'src/icons'`(目录/无扩展名)→ 自动补 `/icons.tsx`
- 无 `jsx` + `output: 'public/svg'` → svg renderer,逐图标 `github.svg`…
- `format: 'css'` + `output: 'public/icons.css'` → 单个自包含 stylesheet

## Codegen 规则

### CSS renderer

CSS renderer 将每个归一化 SVG 用 `encodeURIComponent` 序列化为 data URL,
因此 `icons.css` 之外没有 SVG/font/script 请求。`.sigil` 只负责 layout,
不 reset 周边的 typography、line-height 或 color。

- `mask`:per-icon rule 用 `background-color: currentColor` + alpha mask;
  SVG 内的 opacity 保留,所以 duotone 仍有深浅层次。
- `image`:per-icon rule 用 background image,保留 gradient/多色 fill,
  但不继承 `currentColor`。
- class 名直接复用稳定 file naming:`LuHouse → .sigil-lu-house`。
- 每条 rule 保留 ref/license 注释;任一 icon 缺失时在 render/write 前失败。

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

### Octane(`jsx: 'octane'`)

输出 `.tsrx` 模块,以
[`octane/jsx-runtime`](https://github.com/octanejs/octane/blob/main/packages/octane/src/jsx-runtime.d.ts)
的 `Octane.JSX.IntrinsicElements['svg']` 作为 props 合同。Octane 的 JSX
surface 是 React-shaped,所以与 React renderer 共用原生 SVG 属性到
camelCase JSX 属性的转换。组件使用 `@{}` 模板体;atlas 使用 Octane
自己的 `useState`/`useMemo`/`useEffect`/`useRef`。

### TSRX(`jsx: 'tsrx'`,ripple-ts → Ripple)

输出 `.tsrx` 模块。依据 [tsrx.dev](https://tsrx.dev) 规格:Ripple 用原生 host
属性(`class`/`stroke-width`),且"TSRX keeps authored attributes as written"
——所以 body 与 Solid 一样原样内联,不改名。组件是普通 TS 函数返回 JSX,
参数用 `&{ size = '1em', ...props }` 惰性解构保 Ripple 的细粒度响应。

Octane 与 Ripple 共享 TSRX 语法族,基础组件形状接近,但不是同一个生成目标:
JSX 类型入口、SVG 属性合同和 atlas 状态 API 都不同。共享转换 helper,不合并
renderer 身份,避免把“编译器能解析”误当成完整的类型与运行时兼容。

### svg(无 `jsx`)

逐图标输出完整 `.svg` 文件(`iconToHTML` 包装),文件头带 license 注释。

## CLI(argc)

用 [argc](https://github.com/ethan-huo/argc) v7 schema-first 定义,白送
`@schema`(agent 自描述)、`@run` 脚本入口、`@skill` 内嵌使用指南和 shell
completions。

```
context: { manifest?: string }   # 默认 ./icons.json;--context 或 ARGC_CTX 传入

sigil sources '{}'
sigil use "{ sets: [...], variant?, prefix?, cssMode? }"
sigil search "{ query, set?, all?, limit? }"
sigil add "{ refs: [...], as? }"
sigil remove "{ refs: [...] }"       # 裸 set 名删整个库
sigil list '{}'
sigil etch "{ output, format? | jsx?, atlas? }"
```

- **不设 alias 或 ref DSL**(rm/ls/-o/`a+b,c` 这类短形式):使用者是 agent,
  结构化字段比 shell 方言更稳定。
- stdout 纪律:handler 返回结构化结果,argc 序列化为 YAML;诊断走 stderr。
  脚本需要严格 JSON 时用 `@run --json`,命令本身不暴露 `json` flag。
- search 路由:`set` 命中已 vendor 的专属 adapter → 本地搜索;
  否则 iconify API 全局发现。

## 非目标

- lockfile / 版本钉死(上游近似 append-only,etch 失败兜底足够)
- 运行时图标组件(那是 `@iconify/react` 的事;sigil 产出的是源码)
- SVG 优化(Iconify 数据已优化过;SVGO 属于过度机械)
- MCP server(CLI + `@schema` 对 agent 已足够;需要时再包一层)

## 已知尾巴

见 `.agents/backlog.md`:resolve 结果缓存(目前每次 etch 都打 API)、
动画图标集(line-md)的 `<style>` 块在 react 转换下的兼容性、ripple renderer。
