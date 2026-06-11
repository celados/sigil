# Backlog

- **vendor 更新机制**:vendor 是"存在即跳过",上游新增图标不会自动出现。
  需要 `sigil update [set]`(git pull)或 `--refresh`。
- **动画图标集兼容性**:line-md 等 set(走 iconify fallback)的 body 含
  `<style>`/`animate` 元素,react 转换未验证。
- **tsrx renderer caveats**:已实现(`--jsx tsrx` → `.tsrx`,基于 tsrx.dev 规格)。
  两点待观察:① tsrx DSL 仍在演进(用户会同步 update),变更改 src/render/tsrx.ts;
  ② `IconProps` 用本地 `[attr]: unknown` 索引签名,未绑定 Ripple 的 SVG props 类型
  (避免猜 Ripple 的 import);若 Ripple 暴露官方 SVG attr 类型可收紧。
- **动画集 `<style>` 在 tsrx 下**:TSRX 把 `<style>` 当 CSS 解析,line-md 等
  fallback 集的 body 含 `<style>` 时,tsrx/react 产物都未验证(6 个内置库无此问题)。
- **search 上游盲区**:Iconify 搜索索引隐藏 deprecated 图标。专属 adapter
  的本地搜索已绕过(lucide tags 可搜),但 fallback set 仍受限。
- **tabler search 排序**:outline 命中排在 filled 前,大结果集下 filled
  可能被 limit 截断;需要时做交错合并。
- **simple-icons title 搜索**:`data/simple-icons.json` 有 title/aka 可做
  跨名搜索(".NET" → dotnet),需额外 sparse-checkout `data/` + slugify。
- **bin 分发**:`bin` 指向 `src/index.ts`(bun-only)。npm 发布需 build。
- **heroicons 16px 缺口**(上游事实,非 bug):8 个图标无 16px 版本,
  resolve 时走 missing 路径,与 Iconify collection 一致。
- **`use` 交互选择器**:`sigil sources` 和裸 `sigil use` 已覆盖非交互发现;
  如面向人类终端再增强,可给裸 `use` 接 prompt selector。
