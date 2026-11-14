#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学籍系统 · AI 查询 HTTP API (api_server.py)
=========================================
身份 = 主键: 学号 -> 学生; 教师号 -> 老师/管理员(T001)。
纯 Python 标准库。启动: python api_server.py -> http://127.0.0.1:8090/api/ask
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai"))
import ai_layer  # noqa: E402

PORT = 8090



class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self._send(404, '{"error":"not found"}')

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
    print("学籍 AI API -> http://127.0.0.1:%d/api/ask" % PORT)
    print("演示主键: 学生 20230001 / 老师 T002 / 管理员 T001")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
