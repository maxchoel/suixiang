/*
 * 云同步配置（可选）。
 *
 * 不填时，「随想」保持纯本地：不显示登录入口，也不发起任何网络请求。
 *
 * 填写方法见 journal/SYNC.md：
 *   url      Supabase 项目地址，形如 https://xxxx.supabase.co
 *   anonKey  Supabase 的 anon / publishable key（可以公开，受 RLS 保护）
 *
 * 绝对不要把 service_role key 写在这里。
 */
window.SUIXIANG_SUPABASE = {
  url: "https://sfjobsrfrqoblrsfjvwv.supabase.co",
  anonKey: "sb_publishable_hGALjR6Qy5eOQf9CkpnF9w_2t6AJOTa"
};
