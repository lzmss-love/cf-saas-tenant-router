// 管理面板页面。由线上部署包(2026-10-23 16:11 UTC 版本)逆向还原为源码，行为与线上一致。
// 登录门用 ADMIN_TOKEN（localStorage 保存），数据走 /__saas/admin API。
export const PANEL_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SaaS 租户管理面板</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:#0b0d12;color:#e8e8e8;min-height:100vh}
a{color:#6cb6ff}
header{padding:18px 28px;border-bottom:1px solid #1c2230;display:flex;align-items:center;gap:14px}
header .brand{font-size:13px;letter-spacing:.3em;color:#7d8590;font-weight:600}
header .title{font-size:15px}
header .sp{flex:1}
button{background:#1c2333;color:#e8e8e8;border:1px solid #2a3348;border-radius:8px;padding:7px 13px;font-size:13px;cursor:pointer}
button:hover{background:#242e44}
button.primary{background:#2f6feb;border-color:#2f6feb;color:#fff}
button.danger{background:#3a1620;border-color:#5c2333;color:#ff8da1}
main{max-width:1080px;margin:0 auto;padding:28px 20px}
.card{background:#10141d;border:1px solid #1c2230;border-radius:12px;padding:18px}
.stats{display:flex;gap:14px;margin-bottom:18px;flex-wrap:wrap}
.stat{flex:1;min-width:150px}
.stat .num{font-size:26px;font-weight:700;margin-top:6px}
.stat .lbl{font-size:12px;color:#8b93a3;letter-spacing:.1em}
.toolbar{display:flex;gap:10px;margin-bottom:14px;align-items:center}
.toolbar .sp{flex:1}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:#8b93a3;font-weight:500;padding:10px 12px;border-bottom:1px solid #1c2230;white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid #151b27;vertical-align:top;word-break:break-all}
tbody tr:hover td{background:#121826}
.badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;border:1px solid}
.badge.active{color:#7ee2a8;border-color:#2b5c40;background:#10241a}
.badge.pending{color:#ffd479;border-color:#5c4a1f;background:#241d0e}
.badge.deleted{color:#ff8da1;border-color:#5c2333;background:#241016}
.muted{color:#8b93a3}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px}
.empty{padding:40px;text-align:center;color:#8b93a3}
.tabs{display:flex;gap:8px;margin-bottom:16px}
.tabs .tab{background:#10141d;border:1px solid #1c2230;color:#8b93a3}
.tabs .tab.on{background:#2f6feb;border-color:#2f6feb;color:#fff}
.badge.used{color:#8b93a3;border-color:#2a3348;background:#151b27}
.badge.revoked{color:#ff8da1;border-color:#5c2333;background:#241016}
.badge.suspended{color:#ff8da1;border-color:#5c2333;background:#241016}
.toolbar input,.toolbar select{background:#0b0d12;border:1px solid #2a3348;border-radius:8px;color:#e8e8e8;padding:7px 10px;font-size:13px}
.toolbar input{width:240px}
td button{white-space:nowrap}
#tbody td:last-child,#hnBody td:last-child,#optBody td:last-child{white-space:nowrap}
.overlay{position:fixed;inset:0;background:rgba(4,6,10,.72);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50}
.overlay[hidden]{display:none}
.modal{width:100%;max-width:540px;max-height:88vh;overflow:auto}
.modal h3{font-size:15px;margin-bottom:14px}
.field{margin-bottom:12px}
.field label{display:block;font-size:12px;color:#8b93a3;margin-bottom:6px}
.field input,.field select,.field textarea{width:100%;background:#0b0d12;border:1px solid #2a3348;border-radius:8px;color:#e8e8e8;padding:9px 11px;font-size:13px}
.field textarea{min-height:56px;resize:vertical}
.row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}
.err{color:#ff8da1;font-size:12px;margin-top:8px;min-height:16px}
pre{background:#0b0d12;border:1px solid #1c2230;border-radius:8px;padding:12px;font-size:12px;overflow:auto;white-space:pre-wrap;word-break:break-all}
</style>
</head>
<body>
<header>
  <span class="brand">SAAS TENANT ROUTER</span>
  <span class="title">管理控制面板</span>
  <span class="sp"></span>
  <button id="btnLogout" hidden>退出登录</button>
</header>
<main>
  <div id="gate" class="card" style="max-width:420px;margin:8vh auto 0">
    <h3 style="margin-bottom:6px;font-size:15px">管理员登录</h3>
    <p class="muted" style="font-size:12px;margin-bottom:14px">输入管理员账号和密码（Worker 密钥 ADMIN_TOKEN，格式 账号:密码），仅保存在本浏览器 localStorage。</p>
    <div class="field"><input id="user" placeholder="账号" autocomplete="username"></div>
    <div class="field"><input id="pass" type="password" placeholder="密码" autocomplete="current-password"></div>
    <button class="primary" id="btnLogin" style="width:100%">进入面板</button>
    <div class="err" id="gateErr"></div>
    <p class="muted" style="font-size:12px;margin-top:14px;text-align:center">客户接入？<a href="/join" style="color:#6cb6ff">域名自助接入 →</a></p>
  </div>
  <div id="app" hidden>
    <nav class="tabs">
      <button class="tab on" data-tab="tenants">租户</button>
      <button class="tab" data-tab="codes">接入码</button>
      <button class="tab" data-tab="hostnames">自定义主机名</button>
      <button class="tab" data-tab="opt">优选</button>
    </nav>
    <section id="tab-tenants">
    <div class="stats">
      <div class="card stat"><div class="lbl">租户总数</div><div class="num" id="stTotal">–</div></div>
      <div class="card stat"><div class="lbl">已启用 (active)</div><div class="num" id="stActive">–</div></div>
      <div class="card stat"><div class="lbl">待接入 (pending)</div><div class="num" id="stPending">–</div></div>
    </div>
    <div class="toolbar">
      <button id="btnRefresh">刷新</button>
      <span class="sp"></span>
      <button class="primary" id="btnAdd">＋ 新增租户</button>
    </div>
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>域名 host</th><th>slug</th><th>套餐</th><th>上游 upstream</th><th>状态</th><th>创建时间</th><th style="width:200px">操作</th></tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div class="empty" id="empty" hidden>暂无租户，点击右上角「新增租户」创建第一个。</div>
    </div>
    <p class="muted" style="font-size:12px;margin-top:14px">说明：新增/编辑后 status 会标记为 pending（不影响路由转发）；删除为软删除。保存后还需在「自定义主机名」标签页为该 host 创建 Custom Hostname，客户侧按「详情」里的 CNAME 信息配置解析。</p>
    </section>
    <section id="tab-opt" hidden>
      <div class="card">
        <p class="muted" style="font-size:12px;margin-bottom:12px">客户域名 CNAME 指向主用入口 <span class="mono" id="optTarget">–</span>（不能删除，只能改指向）；其余记录为备用/特殊线路。类型自动识别：填 IP 建 A 记录、填域名建 CNAME。</p>
        <div class="card" style="margin-bottom:14px">
          <div class="toolbar" style="margin-bottom:0">
            <span class="muted" style="font-size:12px">在线测速（当前线路，测速主机 <span class="mono" id="optTestHost">–</span>）</span>
            <button class="primary" id="btnOptSpeed">开始测速</button>
            <span class="mono" id="optSpeedResult" style="font-size:13px">–</span>
          </div>
          <div class="toolbar" style="margin-bottom:0;margin-top:10px">
            <span class="muted" style="font-size:12px">快捷切换主线路:</span>
            <span id="optPresets"></span>
          </div>
        </div>
        <div class="err" id="optErr"></div>
        <div class="card" style="padding:0">
          <table>
            <thead><tr><th>记录</th><th>类型</th><th style="width:45%">指向（IP 或优选域名）</th><th>更新时间</th><th style="width:170px">操作</th></tr></thead>
            <tbody id="optBody"></tbody>
          </table>
        </div>
        <div class="toolbar" style="margin-top:12px">
          <input id="optNewName" placeholder="opt4" autocomplete="off" style="width:90px">
          <input id="optNewValue" placeholder="IP 或优选域名" autocomplete="off" style="flex:1">
          <button class="primary" id="btnOptAdd">＋ 新增</button>
          <button id="btnOptRefresh">刷新</button>
        </div>
        <p class="muted" style="font-size:12px;margin-top:12px;line-height:1.8">
          自动测速：本机执行 <span class="mono">npm run optimize</span>，对 24 个候选 IP 测 TLS 握手并自动更新主用 opt，建议每周一次。<br>
          非标端口反代节点（如 opt3 的 IP:26524）仅适合支持自定义端口的客户端——TG WEB 固定 443 用不了。
        </p>
      </div>
    </section>
    <section id="tab-codes" hidden>
      <div class="toolbar">
        <button id="btnCodeRefresh">刷新</button>
        <span class="sp"></span>
        <button class="primary" id="btnCodeNew">＋ 生成接入码</button>
      </div>
      <div class="err" id="codesErr"></div>
      <div class="card" style="padding:0">
        <table>
          <thead><tr><th>接入码</th><th>slug</th><th>套餐</th><th>状态</th><th>使用域名</th><th>创建时间</th><th style="width:220px">操作</th></tr></thead>
          <tbody id="codesBody"></tbody>
        </table>
        <div class="empty" id="codesEmpty" hidden>暂无接入码，点「生成接入码」创建后发给客户。</div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:14px">客户拿到接入码后访问本域名下的 <span class="mono">/join</span>，输入接入码和自己的域名即可自助完成接入。</p>
    </section>
    <section id="tab-hostnames" hidden>
      <div class="toolbar">
        <button id="btnHnRefresh">刷新</button>
        <span class="sp"></span>
        <input id="hnInput" placeholder="client.example.com" autocomplete="off">
        <select id="hnMethod"><option value="http">HTTP 验证</option><option value="txt">TXT 验证</option></select>
        <button class="primary" id="btnHnAdd">＋ 添加</button>
      </div>
      <div class="err" id="hnErr"></div>
      <div class="card" style="padding:0">
        <table>
          <thead><tr><th>主机名</th><th>主机名状态</th><th>证书状态</th><th>证书到期 / 续期</th><th style="width:120px">操作</th></tr></thead>
          <tbody id="hnBody"></tbody>
        </table>
        <div class="empty" id="hnEmpty" hidden>暂无自定义主机名。</div>
      </div>
      <p class="muted" style="font-size:12px;margin-top:14px">需要 Worker 配置 <span class="mono">CF_API_TOKEN</span> 密钥（权限：Zone - Custom Hostnames - Edit）。未配置或权限不足时操作会给出提示。</p>
    </section>
  </div>
</main>
<div class="overlay" id="formOv" hidden>
  <div class="card modal">
    <h3 id="formTitle">新增租户</h3>
    <div class="field"><label>客户域名 host *（例如 client.example.com）</label><input id="fHost" placeholder="client.example.com"></div>
    <div class="field"><label>slug *（英文标识，例如 client1）</label><input id="fSlug" placeholder="client1"></div>
    <div class="field"><label>套餐 plan</label><select id="fPlan"><option value="free">free</option><option value="basic">basic</option><option value="pro">pro</option></select></div>
    <div class="field"><label>上游 upstream_base（例如 https://xxx.workers.dev，留空则使用全局 TENANT_UPSTREAM_BASE）</label><input id="fUp" placeholder="https://"></div>
    <div class="field"><label>备注 note</label><textarea id="fNote"></textarea></div>
    <div class="err" id="formErr"></div>
    <div class="row"><button id="btnCancel">取消</button><button class="primary" id="btnSave">保存</button></div>
  </div>
</div>
<div class="overlay" id="detailOv" hidden>
  <div class="card modal">
    <h3>租户详情</h3>
    <pre id="detailBody"></pre>
    <div class="row"><button class="primary" id="btnDetailClose">关闭</button></div>
  </div>
</div>
<div class="overlay" id="hnDetailOv" hidden>
  <div class="card modal">
    <h3>自定义主机名详情</h3>
    <pre id="hnDetailBody"></pre>
    <div class="row"><button class="primary" id="btnHnDetailClose">关闭</button></div>
  </div>
</div>
<div class="overlay" id="codeOv" hidden>
  <div class="card modal">
    <h3>生成接入码</h3>
    <div class="field"><label>slug *（客户标识，例如 client1）</label><input id="cSlug" placeholder="client1"></div>
    <div class="field"><label>套餐 plan</label><select id="cPlan"><option value="free">free</option><option value="basic">basic</option><option value="pro">pro</option></select></div>
    <div class="field"><label>备注 note</label><textarea id="cNote"></textarea></div>
    <div class="err" id="codeErr"></div>
    <div class="row"><button id="btnCodeCancel">取消</button><button class="primary" id="btnCodeSave">生成</button></div>
  </div>
</div>
<script>
(function(){
'use strict';
var KEY='saas_admin_token';
var token=localStorage.getItem(KEY)||'';
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function fmtTime(s){if(!s)return'–';return String(s).replace('T',' ').replace('Z','')}
function api(method,path,body){
  return fetch('/__saas/admin'+path+'?token='+encodeURIComponent(token),{method:method,headers:{'x-cf-saas-admin':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):void 0}).then(function(r){
    var ct=r.headers.get('content-type')||'';
    if(ct.indexOf('application/json')<0){return{status:r.status,json:{ok:false,error:'unauthorized'}}}
    return r.json().then(function(j){return{status:r.status,json:j}});
  });
}
var tenants=[];
function badge(st){return '<span class="badge '+esc(st)+'">'+esc(st)+'</span>'}
function load(){
  return api('GET','').then(function(res){
    if(!res.json||res.json.ok!==true){throw new Error('ADMIN_TOKEN 无效（请确认已在 Worker 变量中配置）')}
    tenants=res.json.tenants||[];
    render();
  });
}
function render(){
  var total=tenants.length,active=0,pending=0;
  tenants.forEach(function(t){if(t.status==='active')active++;else if(t.status==='pending')pending++});
  $('stTotal').textContent=total;
  $('stActive').textContent=active;
  $('stPending').textContent=pending;
  var tb=$('tbody');tb.innerHTML='';
  $('empty').hidden=total>0;
  tenants.forEach(function(t){
    var tr=document.createElement('tr');
    var stBadge='<span class="badge '+esc(t.status)+'">'+esc(t.status)+'</span>';
    var toggle=t.status==='active'
      ?'<button data-act="tog" data-host="'+esc(t.host)+'" data-to="suspended">停用</button> '
      :'<button data-act="tog" data-host="'+esc(t.host)+'" data-to="active">启用</button> ';
    tr.innerHTML='<td class="mono">'+esc(t.host)+'</td>'
      +'<td class="mono">'+esc(t.slug)+'</td>'
      +'<td>'+esc(t.plan)+'</td>'
      +'<td class="mono muted">'+esc(t.upstream_base||'（未配置）')+'</td>'
      +'<td>'+stBadge+'</td>'
      +'<td class="muted">'+esc(fmtTime(t.created_at))+'</td>'
      +'<td>'
      +'<button data-act="detail" data-host="'+esc(t.host)+'">详情</button> '
      +'<button data-act="edit" data-host="'+esc(t.host)+'">编辑</button> '
      +toggle
      +'<button class="danger" data-act="del" data-host="'+esc(t.host)+'">删除</button>'
      +'</td>';
    tb.appendChild(tr);
  });
}
$('tbody').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  var host=b.getAttribute('data-host'),act=b.getAttribute('data-act');
  var t=tenants.filter(function(x){return x.host===host})[0];if(!t)return;
  if(act==='edit'){openForm(t);}
  else if(act==='tog'){
    var to=b.getAttribute('data-to');
    if(!confirm(to==='suspended'?('停用 '+host+' ？该域名将停止转发。'):('启用 '+host+' ？'))){return}
    api('PUT','/'+encodeURIComponent(host),{status:to}).then(function(){load()});
  }
  else if(act==='del'){
    if(!confirm('确定删除租户 '+host+' ？（软删除，数据库中保留记录）'))return;
    api('DELETE','/'+encodeURIComponent(host)).then(function(){load()});
  }
  else if(act==='detail'){
    api('GET','/'+encodeURIComponent(host)).then(function(res){
      var j=res.json||{};
      var tn=j.tenant||{};
      var lines=[];
      lines.push('host: '+tn.host);
      lines.push('slug: '+tn.slug+'    plan: '+tn.plan+'    status: '+tn.status);
      lines.push('upstream: '+(tn.upstream_base||'（未配置）'));
      if(j.customer_cname_record){
        lines.push('');
        lines.push('客户侧 DNS 记录：');
        lines.push('  类型: '+j.customer_cname_record.type);
        lines.push('  主机: '+j.customer_cname_record.host);
        lines.push('  指向: '+j.customer_cname_record.target);
        lines.push('  说明: '+j.customer_cname_record.note);
      }
      lines.push('');
      lines.push('下一步：在 Cloudflare 控制台为 '+tn.host+' 创建 Custom Hostname（证书验证通过即可生效）。');
      $('detailBody').textContent=lines.join(String.fromCharCode(10));
      $('detailOv').hidden=false;
    });
  }
});
function openForm(t){
  $('formTitle').textContent=t?'编辑租户':'新增租户';
  $('fHost').value=t?t.host:'';
  $('fSlug').value=t?t.slug:'';
  $('fPlan').value=t?(t.plan||'free'):'free';
  $('fUp').value=t?(t.upstream_base||''):'';
  $('fNote').value=t?(t.note||''):'';
  $('formErr').textContent='';
  $('fHost').readOnly=!!t;
  $('formOv').hidden=false;
}
$('btnAdd').onclick=function(){openForm(null)};
$('btnCancel').onclick=function(){$('formOv').hidden=true};
$('btnDetailClose').onclick=function(){$('detailOv').hidden=true};
$('btnHnDetailClose').onclick=function(){$('hnDetailOv').hidden=true};
$('btnSave').onclick=function(){
  var host=$('fHost').value.trim().toLowerCase(),slug=$('fSlug').value.trim();
  if(!host||host.indexOf('.')<0){$('formErr').textContent='请输入合法的域名 host';return}
  if(!slug){$('formErr').textContent='请输入 slug';return}
  var body={host:host,slug:slug,plan:$('fPlan').value,upstream_base:$('fUp').value.trim(),note:$('fNote').value};
  api('PUT','',body).then(function(res){
    if(res.json&&res.json.ok){$('formOv').hidden=true;load()}
    else{$('formErr').textContent=(res.json&&res.json.error)||'保存失败'}
  });
};
$('btnLogin').onclick=function(){
  var u=$('user').value.trim(),p=$('pass').value.trim();
  token=u&&p?u+':'+p:'';
  $('gateErr').textContent='';
  if(!token){$('gateErr').textContent='请输入账号和密码';return}
  load().then(function(){
    localStorage.setItem(KEY,token);
    $('gate').hidden=true;$('app').hidden=false;$('btnLogout').hidden=false;
  }).catch(function(){$('gateErr').textContent='登录失败：账号或密码错误'});
};
$('btnRefresh').onclick=function(){load()};
$('btnLogout').onclick=function(){localStorage.removeItem(KEY);token='';$('app').hidden=true;$('btnLogout').hidden=true;$('gate').hidden=false};

// ---- 标签页切换 ----
var TABS=['tenants','codes','hostnames','opt'];
document.querySelectorAll('.tabs .tab').forEach(function(b){
  b.onclick=function(){
    var t=b.getAttribute('data-tab');
    document.querySelectorAll('.tabs .tab').forEach(function(x){x.classList.toggle('on',x===b)});
    TABS.forEach(function(name){$('tab-'+name).hidden=(name!==t)});
    if(t==='codes')loadCodes();
    if(t==='hostnames')loadHn();
    if(t==='opt')loadOpts();
  };
});

// ---- 多路优选 ----
var optList=[];
var optTestHost='',optPresets=[];
function loadOpts(){
  $('optErr').textContent='';
  return api('GET','/opts').then(function(res){
    if(!res.json||res.json.ok!==true)throw new Error((res.json&&res.json.error)||'加载失败');
    $('optTarget').textContent=res.json.target||'–';
    optList=res.json.opts||[];
    optTestHost=res.json.testHost||'';
    optPresets=res.json.presets||[];
    $('optTestHost').textContent=optTestHost||'（未配置 OPT_TEST_HOST）';
    var ps=$('optPresets');ps.innerHTML='';
    optPresets.forEach(function(p){
      var b=document.createElement('button');
      b.textContent=p;b.className='mono';b.style.fontSize='11px';
      b.onclick=function(){
        if(!confirm('主线路切换到 '+p+' ？'))return;
        api('PUT','/opts/opt',{value:p}).then(function(res){
          if(res.json&&res.json.ok)loadOpts();
          else $('optErr').textContent=(res.json&&res.json.error)||'切换失败';
        });
      };
      ps.appendChild(b);
      ps.appendChild(document.createTextNode(' '));
    });
    if(!optPresets.length)ps.innerHTML='<span class="muted">（未配置 OPT_PRESETS）</span>';
    renderOpts();
  }).catch(function(e){$('optErr').textContent=e.message||'加载失败'});
}
$('btnOptSpeed').onclick=function(){
  var b=$('btnOptSpeed'),out=$('optSpeedResult');
  if(!optTestHost){$('optErr').textContent='未配置测速主机（OPT_TEST_HOST）';return}
  b.disabled=true;b.textContent='测速中...';out.textContent='–';
  var times=[],i=0;
  function once(){
    var t0=Date.now();
    fetch('https://'+optTestHost+'/cdn-cgi/trace',{cache:'no-store'})
      .then(function(r){return r.text()})
      .then(function(txt){
        var ms=Date.now()-t0;
        if(txt.indexOf('fl=')<0)throw new Error('非 CF 响应');
        times.push(ms);
        out.textContent=times.map(function(t){return t+'ms'}).join(' / ');
        if(++i<3){once();return}
        var sorted=times.slice().sort(function(a,b){return a-b});
        out.textContent+='　中位 '+sorted[1]+'ms';
        b.disabled=false;b.textContent='开始测速';
      })
      .catch(function(e){
        out.textContent='失败：'+(e.message||'网络错误');
        b.disabled=false;b.textContent='开始测速';
      });
  }
  once();
};
function renderOpts(){
  var tb=$('optBody');tb.innerHTML='';
  optList.forEach(function(o){
    var tr=document.createElement('tr');
    var main=o.fqdn===$('optTarget').textContent?' <span class="badge active">主用</span>':'';
    tr.innerHTML='<td class="mono">'+esc(o.name)+main+'</td>'
      +'<td>'+'<span class="badge '+esc(o.type==='A'?'active':'used')+'">'+esc(o.type)+'</span>'+'</td>'
      +'<td><input class="optVal" data-name="'+esc(o.name)+'" value="'+esc(o.value)+'" style="width:100%;background:#0b0d12;border:1px solid #2a3348;border-radius:8px;color:#e8e8e8;padding:7px 10px;font-size:12px;font-family:ui-monospace,Consolas,monospace"></td>'
      +'<td class="muted">'+esc(String(o.modified_on||'–').slice(0,10))+'</td>'
      +'<td>'
      +'<button data-act="optsave" data-name="'+esc(o.name)+'">保存</button> '
      +(o.fqdn!==$('optTarget').textContent?'<button class="danger" data-act="optdel" data-name="'+esc(o.name)+'">删除</button>':'')
      +'</td>';
    tb.appendChild(tr);
  });
}
$('optBody').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  var name=b.getAttribute('data-name');
  if(b.getAttribute('data-act')==='optsave'){
    var input=document.querySelector('.optVal[data-name="'+name+'"]');
    var v=(input&&input.value||'').trim().toLowerCase();
    if(!v){$('optErr').textContent='指向值不能为空';return}
    api('PUT','/opts/'+encodeURIComponent(name),{value:v}).then(function(res){
      if(res.json&&res.json.ok)loadOpts();
      else $('optErr').textContent=(res.json&&res.json.error)||'保存失败';
    });
  }else if(b.getAttribute('data-act')==='optdel'){
    if(!confirm('删除优选记录 '+name+' ？引用它的域名解析将失效。'))return;
    api('DELETE','/opts/'+encodeURIComponent(name)).then(function(res){
      if(res.json&&res.json.ok)loadOpts();
      else $('optErr').textContent=(res.json&&res.json.error)||'删除失败';
    });
  }
});
$('btnOptRefresh').onclick=function(){loadOpts()};
$('btnOptAdd').onclick=function(){
  var name=$('optNewName').value.trim().toLowerCase(),v=$('optNewValue').value.trim().toLowerCase();
  $('optErr').textContent='';
  if(!name||!v){$('optErr').textContent='请填记录名和指向值';return}
  api('POST','/opts',{name:name,value:v}).then(function(res){
    if(res.json&&res.json.ok){$('optNewName').value='';$('optNewValue').value='';loadOpts()}
    else $('optErr').textContent=(res.json&&res.json.error)||'新增失败';
  });
};

// ---- 接入码 ----
var codes=[];
function loadCodes(){
  $('codesErr').textContent='';
  return api('GET','/codes').then(function(res){
    if(!res.json||res.json.ok!==true)throw new Error((res.json&&res.json.error)||'加载失败');
    codes=res.json.codes||[];
    renderCodes();
  }).catch(function(e){$('codesErr').textContent=e.message||'加载失败'});
}
function renderCodes(){
  var tb=$('codesBody');tb.innerHTML='';
  $('codesEmpty').hidden=codes.length>0;
  codes.forEach(function(c){
    var tr=document.createElement('tr');
    var stBadge='<span class="badge '+esc(c.status)+'">'+esc(c.status==='active'?'可用':c.status==='used'?'已使用':'已作废')+'</span>';
    tr.innerHTML='<td class="mono" style="font-size:14px;font-weight:600;letter-spacing:.1em">'+esc(c.code)+'</td>'
      +'<td class="mono">'+esc(c.slug)+'</td>'
      +'<td>'+esc(c.plan)+'</td>'
      +'<td>'+stBadge+'</td>'
      +'<td class="mono muted">'+esc(c.used_by_host||'–')+'</td>'
      +'<td class="muted">'+esc(fmtTime(c.created_at))+'</td>'
      +'<td>'
      +'<button data-act="copy" data-code="'+esc(c.code)+'">复制</button> '
      +(c.status==='active'?'<button class="danger" data-act="revoke" data-id="'+c.id+'">作废</button>':'')
      +'</td>';
    tb.appendChild(tr);
  });
}
$('codesBody').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  var act=b.getAttribute('data-act');
  if(act==='copy'){
    var code=b.getAttribute('data-code');
    var text='接入码: '+code+String.fromCharCode(10)+'自助接入地址: 面板同域名的 /join';
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text)}else{prompt('复制以下内容',text)}
    b.textContent='已复制';
    setTimeout(function(){b.textContent='复制'},1500);
  }else if(act==='revoke'){
    if(!confirm('作废该接入码？作废后无法使用。'))return;
    api('DELETE','/codes/'+b.getAttribute('data-id')).then(function(){loadCodes()});
  }
});
$('btnCodeNew').onclick=function(){$('cSlug').value='';$('cNote').value='';$('codeErr').textContent='';$('codeOv').hidden=false};
$('btnCodeCancel').onclick=function(){$('codeOv').hidden=true};
$('btnCodeSave').onclick=function(){
  var slug=$('cSlug').value.trim();
  if(!slug){$('codeErr').textContent='请输入 slug';return}
  api('POST','/codes',{slug:slug,plan:$('cPlan').value,note:$('cNote').value}).then(function(res){
    if(res.json&&res.json.ok){$('codeOv').hidden=true;loadCodes()}
    else{$('codeErr').textContent=(res.json&&res.json.error)||'生成失败'}
  });
};

// ---- 自定义主机名 ----
var hostnames=[];
function loadHn(){
  $('hnErr').textContent='';
  return api('GET','/hostnames').then(function(res){
    if(!res.json||res.json.ok!==true)throw new Error((res.json&&res.json.error)||'加载失败');
    hostnames=res.json.hostnames||[];
    renderHn();
  }).catch(function(e){$('hnErr').textContent=e.message||'加载失败'});
}
function renderHn(){
  var tb=$('hnBody');tb.innerHTML='';
  $('hnEmpty').hidden=hostnames.length>0;
  hostnames.forEach(function(h){
    var tr=document.createElement('tr');
    tr.innerHTML='<td class="mono">'+esc(h.hostname)+'</td>'
      +'<td>'+'<span class="badge '+esc(h.status)+'">'+esc(h.status)+'</span>'+'</td>'
      +'<td>'+'<span class="badge '+esc(h.cert_status)+'">'+esc(h.cert_status||'–')+'</span>'+'</td>'
      +'<td class="muted">'+esc(h.cert_expires?String(h.cert_expires).slice(0,10):(h.cert_status==='active'?'自动续期':'–'))+'</td>'
      +'<td>'
      +'<button data-act="hndetail" data-id="'+esc(h.id)+'">详情</button> '
      +'<button class="danger" data-act="hndel" data-id="'+esc(h.id)+'" data-host="'+esc(h.hostname)+'">删除</button>'
      +'</td>';
    tb.appendChild(tr);
  });
}
$('hnBody').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;
  if(b.getAttribute('data-act')==='hndetail'){
    var id=b.getAttribute('data-id');
    api('GET','/hostnames/'+encodeURIComponent(id)).then(function(res){
      if(!(res.json&&res.json.ok)){$('hnErr').textContent=(res.json&&res.json.error)||'查询失败';return}
      var h=res.json.hostname;
      var lines=[];
      lines.push('主机名: '+h.hostname);
      lines.push('主机名状态: '+h.status+'    证书状态: '+(h.cert_status||'–'));
      lines.push('证书验证方式: '+(h.cert_method||'–')+'    证书到期: '+(h.cert_expires||'–').slice(0,10));
      lines.push('');
      lines.push('客户要在其 DNS 添加的记录：');
      lines.push('  1. '+h.hostname+'  CNAME  '+$('optTarget').textContent);
      (h.validation_records||[]).forEach(function(r){
        lines.push('  2. 证书验证 TXT（验证方式为 txt 时需要）:');
        lines.push('     '+r.txt_name+'  TXT  '+r.txt_value);
      });
      if(h.dcv_cname){
        lines.push('  DCV 委派方式（推荐，一次配置自动续期）:');
        lines.push('     '+h.dcv_cname.name+'  CNAME  '+h.dcv_cname.target);
      }
      lines.push('');
      lines.push('提示: 证书签发被拒时检查客户域名的 CAA 记录，需授权 ssl.com 等 CA。');
      $('hnDetailBody').textContent=lines.join(String.fromCharCode(10));
      $('hnDetailOv').hidden=false;
    });
    return;
  }
  if(b.getAttribute('data-act')==='hndel'){
    var h=b.getAttribute('data-host');
    if(!confirm('删除自定义主机名 '+h+' ？客户域名将立即停止服务。'))return;
    api('DELETE','/hostnames/'+b.getAttribute('data-id')).then(function(res){
      if(res.json&&res.json.ok){loadHn()}
      else{
        var err=(res.json&&res.json.error)||'删除失败';
        if(res.status===403)err+=' —— Worker 密钥 CF_API_TOKEN 需 SSL and Certificates 权限';
        $('hnErr').textContent=err;
      }
    });
  }
});
$('btnHnRefresh').onclick=function(){loadHn()};
$('btnHnAdd').onclick=function(){
  var hn=$('hnInput').value.trim().toLowerCase();
  $('hnErr').textContent='';
  if(!hn||hn.indexOf('.')<0){$('hnErr').textContent='请输入合法的域名';return}
  $('btnHnAdd').disabled=true;$('btnHnAdd').textContent='添加中...';
  api('POST','/hostnames',{hostname:hn,method:$('hnMethod').value}).then(function(res){
    $('btnHnAdd').disabled=false;$('btnHnAdd').textContent='＋ 添加';
    if(res.json&&res.json.ok){
      $('hnInput').value='';
      loadHn();
      var c=res.json.customer_cname_record;
      if(c)alert('已创建。让客户在其 DNS 添加：'+String.fromCharCode(10)+String.fromCharCode(10)+c.host+'  CNAME  '+c.target);
    }else{
      $('hnErr').textContent=(res.json&&res.json.error)||'创建失败';
    }
  });
};
$('pass').addEventListener('keydown',function(e){if(e.key==='Enter')$('btnLogin').click()});
$('user').addEventListener('keydown',function(e){if(e.key==='Enter')$('btnLogin').click()});
if(token){var ci=token.indexOf(':');$('user').value=ci<0?'':token.slice(0,ci);$('pass').value=ci<0?'':token.slice(ci+1);$('btnLogin').click()}
})();
</script>
</body>
</html>`;

export function panelResponse() {
  return new Response(PANEL_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
