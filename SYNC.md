# 云同步设置（可选）

「随想」默认是纯本地的：不登录、不联网，数据只在这台浏览器里。

如果你希望手机和电脑自动同步，可以给自己的「随想」接一个 [Supabase](https://supabase.com) 项目。Supabase 提供免费的 Postgres 数据库和邮箱密码登录，个人日记的量完全够用，不需要信用卡。

整个过程大约 10 分钟，只需要做一次。

---

## 1. 建一个 Supabase 项目

1. 打开 <https://supabase.com>，注册并登录。
2. 点 **New project**，取个名字（例如 `suixiang`），设置数据库密码，区域选离你近的（例如 `Singapore`）。
3. 等 1～2 分钟，项目初始化完成。

## 2. 建表

1. 在左侧点 **SQL Editor** → **New query**。
2. 打开本目录的 `supabase-schema.sql`，整段复制进去，点 **Run**。

看到 `Success. No rows returned` 即可。它会创建 `entries` 表、索引和行级安全策略（RLS）——每个账号只能读写自己的记录。

## 3. 打开邮箱密码登录

1. 左侧 **Authentication** → **Sign In / Providers**。
2. 确认 **Email** 是启用的。
3. 关掉 **Confirm email**（个人使用没必要多一步验证邮件）。
4. 保存。

> 如果保持开启，注册后需要先点邮件里的确认链接，再回来登录；「随想」也会提示你去确认邮箱。

## 4. 填写配置

1. 在项目页顶部点绿色的 **Connect** 按钮，弹窗里能直接看到 **Project URL** 和 **Publishable key**（旧版叫 **anon public**）。
   如果没有 Connect 按钮：左下角 **Project Settings**（齿轮）→ **API Keys**；Project URL 也可以在 **Project Settings → Data API** 里找到。旧版界面是 **Project Settings → API**。
2. 复制 **Project URL**，形如 `https://abcdefgh.supabase.co`。
3. 复制 **Publishable key**（`sb_publishable_...`）或旧版的 **anon public**（`eyJ...`），两种都可以。
4. 打开 `assets/sync-config.js`，填进去：

```js
window.SUIXIANG_SUPABASE = {
  url: "https://abcdefgh.supabase.co",
  anonKey: "eyJhbGciOi..."
};
```

保存，刷新页面。顶栏搜索框左边会出现「登录同步」。

> `anon` key 本来就是给浏览器用的，可以公开；真正保护数据的是数据库里的 RLS 策略。
> **绝对不要**把 `service_role` key 填进来，它可以绕过所有权限。

## 5. 部署到网上

本地双击 `index.html` 也能用同步（Supabase 允许跨域），但更稳妥的方式是把它放到一个静态站点：

- **Netlify Drop**：打开 <https://app.netlify.com/drop>，把 `suixiang-site.zip` 拖进去（或只拖 `index.html` 和 `assets` 文件夹），几秒后得到一个 `https://xxx.netlify.app` 地址。
- 或者用 Cloudflare Pages、GitHub Pages、Vercel，都行——这只是几个静态文件。

手机和电脑都打开同一个网址，登录同一个账号即可。

> 换网址等于换了一个浏览器存储空间。旧网址里的本地记录请先用「导出备份」导出，在新网址「导入」，再登录同步。

## 6. 在第二台设备上登录

1. 打开同一个网址，点「登录同步」。
2. 没有账号就先点「没有账号？注册」。
3. 登录后会自动拉取云端记录，并把这台设备上已有的记录合并上去。

之后：

- 新增、编辑、删除都会在约 1 秒后自动同步；
- 页面重新可见、网络恢复、每隔 60 秒也会自动同步一次；
- 离线时照常写，联网后自动补传。

---

## 同步是怎么处理的

- 每条记录带 `created_at` / `updated_at` / `deleted_at`。
- 删除是软删除（打一个 `deleted_at` 标记），这样删除动作也能同步到其他设备；本地超过 90 天的删除标记会自动清理。
- 冲突用「最后写入者优先」：比较两端的更新时间，新的覆盖旧的；如果时间几乎相同但内容不同，以云端为准。
- 同步不会上传你的浏览器本地存储，只上传记录本身。

## 隐私与安全

- 记录以明文保存在**你自己的** Supabase 数据库里，作者和 Netlify 都看不到；但 Supabase 作为服务商在技术上可以接触数据库，这不是端到端加密。
- 每个账号只能访问自己的行，RLS 在数据库层生效，即使有人拿到 anon key 也读不到你的记录。
- 密码由 Supabase Auth 管理，本项目不保存密码。
- 想彻底删除云端数据：在 Supabase 的 **Table Editor** 里清空 `entries`，或在 **Authentication → Users** 删除账号（会级联删除记录）。

## 常见问题

**顶栏没有「登录同步」？**
`assets/sync-config.js` 里的 `url` 或 `anonKey` 还是空的，或者文件没加载成功。打开浏览器控制台看是否有 404。

**一直显示「同步失败」？**
先点开弹窗看错误信息。常见原因：URL 填错、anon key 填错、SQL 没跑、RLS 策略没建、项目被暂停。免费项目连续 7 天没有活动会被暂停，去 Supabase 控制台点一下恢复即可。

**注册后提示「请先去邮箱确认」？**
回到第 3 步关掉 **Confirm email**，或者点邮件里的链接后再登录。

**两台设备都有记录，登录后会不会互相覆盖？**
不会直接覆盖。会按更新时间合并；同一秒内内容不同时以云端为准。第一次合并前建议先各导出一份 JSON 备份。

**忘记密码？**
目前页面没有找回密码入口。可以在 Supabase 控制台 **Authentication → Users** 里重置，或重新注册一个账号（旧记录可先导出再导入）。

**卸载/停用 Supabase 后，本地还能用吗？**
能。把 `sync-config.js` 清空，页面立即回到纯本地模式，已同步到本地的记录不受影响。

**同步会消耗多少额度？**
一个人每天写几十条，离免费额度很远。只有首次全量拉取和每次改动的小请求。
