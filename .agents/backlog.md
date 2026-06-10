# Backlog

- **vendor 更新机制**:vendor 是"存在即跳过",上游新增图标不会自动出现。
  需要 `sigil update [set]`(git pull)或 `--refresh`。
- **动画图标集兼容性**:line-md 等 set(走 iconify fallback)的 body 含
  `<style>`/`animate` 元素,react 转换未验证。
- **ripple renderer**:Renderer 接口已就位,等 ripple 框架的 JSX 语义确认。
- **search 上游盲区**:Iconify 搜索索引隐藏 deprecated 图标。专属 adapter
  的本地搜索已绕过(lucide tags 可搜),但 fallback set 仍受限。
- **tabler search 排序**:outline 命中排在 filled 前,大结果集下 filled
  可能被 limit 截断;需要时做交错合并。
- **simple-icons title 搜索**:`data/simple-icons.json` 有 title/aka 可做
  跨名搜索(".NET" → dotnet),需额外 sparse-checkout `data/` + slugify。
- **bin 分发**:`bin` 指向 `src/index.ts`(bun-only)。npm 发布需 build。
- **heroicons 16px 缺口**(上游事实,非 bug):8 个图标无 16px 版本,
  resolve 时走 missing 路径,与 Iconify collection 一致。
