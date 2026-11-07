// 客户自助接入页：凭接入码绑定自己的域名。
// GET /join 出表单；POST /join 提交（JSON）。
import { joinByCode } from "./join.js";

export const JOIN_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>域名自助接入</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#0b0d12;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#10141d;border:1px solid #1c2230;border-radius:12px;padding:24px;width:100%;max-width:460px}
h1{font-size:13px;letter-spacing:.3em;color:#7d8590;font-weight:600;margin-bottom:8px}
h2{font-size:17px;margin-bottom:16px}
.field{margin-bottom:12px}
.field label{display:block;font-size:12px;color:#8b93a3;margin-bottom:6px}
.field input{width:100%;background:#0b0d12;border:1px solid #2a3348;border-radius:8px;color:#e8e8e8;padding:10px 12px;font-size:14px}
button{background:#2f6feb;border:none;border-radius:8px;color:#fff;padding:11px;font-size:14px;cursor:pointer;width:100%}
button:hover{background:#3d7bf5}
.err{color:#ff8da1;font-size:13px;margin-top:10px;min-height:18px}
.ok{color:#7ee2a8;font-size:13px;line-height:1.7;margin-top:12px;word-break:break-all}
code{background:#0b0d12;border:1px solid #1c2230;border-radius:6px;padding:2px 8px;font-family:ui-monospace,Consolas,monospace}
.muted{color:#8b93a3;font-size:12px;margin-top:14px;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <h1>SAAS TENANT ROUTER</h1>
  <h2>域名自助接入</h2>
  <div id="form">
    <div class="field"><label>接入码（管理员提供）</label><input id="code" placeholder="8 位接入码" autocomplete="off" style="text-transform:uppercase"></div>
    <div class="field"><label>你的域名（子域名，例如 shop.example.com）</label><input id="host" placeholder="shop.example.com" autocomplete="off"></div>
    <button id="btn">接入</button>
    <div class="err" id="err"></div>
  </div>
  <div id="done" hidden>
    <div class="ok" id="okMsg"></div>
    <p class="muted">在你的域名 DNS 服务商添加上面这条 CNAME 记录，生效后即可通过你的域名访问服务。</p>
    <p class="muted">证书签发需要几分钟，请稍候再测试 https 访问。</p>
  </div>
</div>
<script>
(function(){
'use strict';
function $(id){return document.getElementById(id)}
$('btn').onclick=function(){
  var code=$('code').value.trim().toUpperCase(),host=$('host').value.trim().toLowerCase();
  $('err').textContent='';
  if(!code||!host){$('err').textContent='请填写接入码和域名';return}
  $('btn').disabled=true;$('btn').textContent='提交中...';
  fetch('/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code,host:host})})
    .then(function(r){return r.json().then(function(j){return{status:r.status,json:j}})})
    .then(function(res){
      if(res.json&&res.json.ok){
        $('form').hidden=true;$('done').hidden=false;
        $('okMsg').innerHTML='接入成功！域名 <code>'+host+'</code><br>请添加 DNS 记录：<br>类型 <code>CNAME</code>　主机 <code>'+host.split('.')[0]+'</code><br>指向 <code>'+res.json.cname_record.target+'</code>';
      }else{
        $('err').textContent=(res.json&&res.json.error)||'接入失败，请稍后重试';
        $('btn').disabled=false;$('btn').textContent='接入';
      }
    })
    .catch(function(){$('err').textContent='网络错误，请稍后重试';$('btn').disabled=false;$('btn').textContent='接入'});
};
$('code').addEventListener('keydown',function(e){if(e.key==='Enter')$('host').focus()});
$('host').addEventListener('keydown',function(e){if(e.key==='Enter')$('btn').click()});
})();
</script>
</body>
</html>`;

export function joinPageResponse() {
  return new Response(JOIN_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function handleJoinPost(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {}
  try {
    const result = await joinByCode(env.TENANTS_DB, env, { code: body.code, host: body.host });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json({ ok: false, error: e.message || "接入失败" }, { status: e.status || 500 });
  }
}
