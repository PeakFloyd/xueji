#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · AI 查询层网页界面 (webui.py)
=======================================
身份 = 主键: 输入学号 -> 学生; 输入教师号 -> 老师/管理员(T001)。
纯 Python 标准库。启动:  python webui.py  ->  http://127.0.0.1:8090
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai"))
import ai_layer  # noqa: E402

PORT = 8090

HTML = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>学籍 AI 查询</title>
<style>
:root{--bg:#0f1117;--panel:#171a22;--border:#2a2f3a;--accent:#4a7dff;--text:#e6e8ee;--muted:#8b93a3;--user:#2c3350;}
*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,Segoe UI,Roboto,"Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column}
header{padding:14px 20px;background:var(--panel);border-bottom:1px solid var(--border);display:flex;gap:14px;align-items:center}
header h1{font-size:16px}.dot{width:9px;height:9px;border-radius:50%;background:#3ecf6e;display:inline-block;margin-right:6px}.sub{color:var(--muted);font-size:12px;margin-left:auto}
#user{width:210px;background:#20242e;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:13px}
#user:focus{outline:none;border-color:var(--accent)}
.picker{position:relative}
.cand{position:absolute;top:calc(100% + 4px);left:0;width:264px;max-height:232px;overflow-y:auto;background:var(--panel);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);z-index:20}
.cand[hidden]{display:none}
.cand .item{padding:7px 11px;font-size:13px;cursor:pointer;display:flex;gap:8px;align-items:center}
.cand .item:hover,.cand .item.sel{background:#232838}
.cand .item .id{font-family:Consolas,monospace}
.cand .item .nm{color:var(--muted);font-size:12px}
.cand .item .rl{margin-left:auto;color:var(--muted);font-size:11px}
.cand .empty{padding:9px 11px;color:var(--muted);font-size:12px}
.spinner{display:inline-block;width:11px;height:11px;margin-right:7px;vertical-align:-1px;border:2px solid #39405a;border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#chat{flex:1;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:14px}
.msg{max-width:80%;padding:12px 15px;border-radius:14px;line-height:1.6;font-size:14.5px;white-space:pre-wrap;word-break:break-word}
.user{align-self:flex-end;background:var(--user);border-top-right-radius:4px}.bot{align-self:flex-start;background:#20242e;border:1px solid var(--border);border-top-left-radius:4px}
.meta{font-size:11px;color:var(--muted);margin-bottom:4px}.msg .data{color:var(--muted);font-size:12px;white-space:pre-wrap}
.tag{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:9px;font-size:10px;background:#3a2540;color:#e0a6ff;border:1px solid #5a3a63}
.scen{display:flex;gap:8px;flex-wrap:wrap;padding:0 20px 6px}.scen button{font-size:12px}
button{background:#20242e;color:var(--text);border:1px solid var(--border);border-radius:8px;padding:6px 11px;cursor:pointer}
button.primary{background:var(--accent);color:#fff;border:none}
#inputbar{display:flex;gap:10px;padding:14px 20px;background:var(--panel);border-top:1px solid var(--border)}
#q{flex:1;background:#20242e;color:var(--text);border:1px solid var(--border);border-radius:10px;padding:12px 14px;font-size:14px;outline:none}
.hint{color:var(--muted);font-size:12px;padding:8px 20px 0;line-height:1.7}
</style></head><body>
<header>
  <div><h1><span class="dot"></span>学籍 AI 查询</h1></div>
  <div class="sub">本地 · 离线 · 身份=主键</div>
</header>
<div class="hint">
  在右侧输入<b>身份主键</b>即可登录：<b>学号</b>=学生(如 20230001)、<b>教师号</b>=老师(如 T002)、
  <b>T001</b>=管理员(也是老师)。身份只认主键，没有密码。
</div>
<div style="display:flex;gap:8px;padding:6px 20px 8px;align-items:center">
  <div class="picker">
    <input id="user" placeholder="输入学号/教师号，或点此选择" autocomplete="off">
    <div class="cand" id="cand" hidden></div>
  </div>
  <button class="primary" onclick="applyWho()">进入</button>
  <span id="who" style="color:var(--muted);font-size:12px"></span>
</div>
<div class="scen" id="scen"></div>
<div id="chat"><div class="hint">输入身份主键后，点“进入”，再选下方示例或输入自己的问题。</div></div>
<div id="inputbar"><textarea id="q" rows="1" placeholder="输入问题，回车发送"></textarea><button class="primary" id="send">发送</button></div>
<script>
const $=s=>document.querySelector(s);
let who=null;
let greeted=null;   // 已打过招呼的身份，避免同一身份重复问候
const STATUS_TAG={DENIED:'越权拦截',PARTIAL:'部分可答',CHAT:'闲聊',NOT_FOUND:'未找到',UNKNOWN:'能力外',CAPABILITIES:'权限说明',PENDING_CONFIRM:'待确认',WRITE_DONE:'已执行',WRITE_CANCELLED:'已取消',PENDING_EXPIRED:'已超时',NOTHING_PENDING:'无待确认',OK:''};
function add(role,text,data,status){
  const c=$('#chat'),w=document.createElement('div');w.className='msg '+role;
  const m=document.createElement('div');m.className='meta';
  m.textContent=(role==='user'?'你':'助手');
  const tag=STATUS_TAG[status];
  if(tag){const s=document.createElement('span');s.className='tag';s.textContent=tag;m.appendChild(s);}
  const b=document.createElement('div');b.textContent=text||'';
  w.appendChild(m);
  if(data){const d=document.createElement('div');d.className='data';d.textContent=data;w.appendChild(d);}
  w.appendChild(b);c.appendChild(w);c.scrollTop=c.scrollHeight;
  return w;
}
// 「思考中」气泡：带旋转加载圈，给等待一点动静
function addThinking(){
  const c=$('#chat'),w=document.createElement('div');w.className='msg bot';
  const m=document.createElement('div');m.className='meta';m.textContent='助手';
  const b=document.createElement('div');
  b.appendChild(Object.assign(document.createElement('span'),{className:'spinner'}));
  b.appendChild(document.createTextNode('思考中…'));
  w.appendChild(m);w.appendChild(b);c.appendChild(w);c.scrollTop=c.scrollHeight;
  return w;
}
// 身份选择：真正的下拉 + 精准搜索（原生 datalist 点一次就弹不出来了）
// 只列演示账号——未登录页面**不暴露全部学号姓名**，否则与 RBAC 自相矛盾
const IDS=[
 {id:'20230001',name:'张伟',  role:'学生'},
 {id:'20230002',name:'李娜',  role:'学生'},
 {id:'20230004',name:'赵敏',  role:'学生'},
 {id:'20240005',name:'孙磊',  role:'学生'},
 {id:'T002',    name:'李文静',role:'老师'},
 {id:'T003',    name:'张明远',role:'老师'},
 {id:'T001',    name:'王建国',role:'管理员'},
];
let candList=[],candSel=-1;
function renderCand(kw){
  const box=$('#cand');kw=(kw||'').trim().toLowerCase();
  candList=IDS.filter(o=>!kw||o.id.toLowerCase().includes(kw)||o.name.includes(kw));
  candSel=-1;box.innerHTML='';
  if(!candList.length){
    const e=document.createElement('div');e.className='empty';e.textContent='没有匹配的身份';
    box.appendChild(e);box.hidden=false;return;
  }
  candList.forEach((o,i)=>{
    const d=document.createElement('div');d.className='item';
    ['id','nm','rl'].forEach(()=>d.appendChild(document.createElement('span')));
    d.children[0].textContent=o.id;d.children[1].textContent=o.name;d.children[2].textContent=o.role;
    d.onmousedown=e=>{e.preventDefault();pick(i);};   // mousedown 先于 blur
    box.appendChild(d);
  });
  box.hidden=false;
}
function openCand(){renderCand($('#user').value);}
function closeCand(){$('#cand').hidden=true;candSel=-1;}
function pick(i){
  const o=candList[i];if(!o)return;
  $('#user').value=o.id;closeCand();setWho();$('#user').focus();
}
function moveSel(d){
  if($('#cand').hidden){openCand();return;}
  if(!candList.length){return;}                     // 空候选：没有可移动的目标
  candSel=(candSel+d+candList.length)%candList.length;
  Array.prototype.forEach.call($('#cand').children,(el,i)=>el.classList.toggle('sel',i===candSel));
}
const SCEN=[
 ['20230001','我的总学分有多少，离毕业还差多少'],
 ['20230001','我选了哪些课'],
 ['20230001','我们系有多少人'],
 ['T002','我教的课有哪些'],
 ['T002','我教的数据库原理平均分是否达标'],
 ['T002','计算机系有多少学生'],
 ['T001','一共有多少老师和学生'],
 ['T001','各系有多少学生'],
 ['T001','把在籍学生名单给我'],
];
function loadScen(){const d=$('#scen');SCEN.forEach(s=>{const b=document.createElement('button');
  b.textContent='['+s[0]+'] '+s[1];b.onclick=()=>{$('#user').value=s[0];setWho();
    send(s[1],true);};d.appendChild(b);});}   // 切换身份 = 重置 + 直接提问，不再多打一次招呼
function setWho(){who=$('#user').value.trim();$('#who').textContent='当前: '+who;}
function applyWho(){setWho();
  if(!who){add('bot','请先输入身份主键（学号/教师号）。');return;}
  if(who===greeted){return;}                 // 同一身份只招呼一次，避免重复问候
  greeted=who;
  fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({user:who,question:'你好',reset:true})})
   .then(r=>r.json()).then(j=>add('bot',j.answer||('已登录 '+who),null,j.status))
   .catch(()=>add('bot','已登录 '+who+'。想问什么？'));}
let busy=false;
async function send(text,reset){
  if(busy)return;const q=(text!==undefined?text:$('#q').value.trim());if(!q)return;
  if(!who)setWho();
  if(!who){add('bot','请先输入身份主键(学号/教师号)再提问。');return;}
  busy=true;$('#send').disabled=true;$('#q').value='';
  add('user',q);
  const ok=addThinking();
  try{
    const r=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user:who,question:q,reset:!!reset})});
    const j=await r.json();ok.remove();add('bot',j.answer||'(空)',j.data,j.status);
  }catch(e){ok.remove();add('bot','请求失败: '+e.message);}
  busy=false;$('#send').disabled=false;
}
$('#send').onclick=()=>send();
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});
$('#user').addEventListener('focus',openCand);
$('#user').addEventListener('click',openCand);
$('#user').addEventListener('input',()=>renderCand($('#user').value));
$('#user').addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'){e.preventDefault();moveSel(1);}
  else if(e.key==='ArrowUp'){e.preventDefault();moveSel(-1);}
  else if(e.key==='Enter'){e.preventDefault();
    if(candSel>=0){pick(candSel);}else{closeCand();applyWho();}}
  else if(e.key==='Escape'){closeCand();}
});
document.addEventListener('click',e=>{if(!e.target.closest('.picker'))closeCand();});
loadScen();
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="text/html; charset=utf-8"):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, HTML)
        else:
            self._send(404, "not found")

    def do_POST(self):
        if self.path != "/api/ask":
            self._send(404, "not found"); return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            pk = body.get("user", "")
            q = body.get("question", "")
            reset = bool(body.get("reset"))
            if reset:
                # 登录/切换身份：清空历史（作用域随身份变，历史不得跨身份复用）
                ai_layer.reset_session(pk)
                if not q:
                    q = "你好"
            r = ai_layer.handle(q, pk, reset=reset)
            self._send(200, json.dumps({
                "answer": r["answer"], "data": r["data"],
                "status": r["status"], "role": r["role"], "display": r["display"],
            }, ensure_ascii=False), "application/json")
        except Exception as e:
            self._send(500, json.dumps({"answer": "错误: %s" % e, "status": "ERROR"},
                                       ensure_ascii=False), "application/json")


if __name__ == "__main__":
    print("学籍 AI 查询 -> http://127.0.0.1:%d" % PORT)
    print("演示主键: 学生 20230001 / 老师 T002 / 管理员 T001")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
