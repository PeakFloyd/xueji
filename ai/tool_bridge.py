#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""JSON-lines boundary between the HTTP agent and server-scoped Python abilities.

Input is one JSON object per line. Only this process imports the database layer;
clients never provide a role, scope, SQL statement, or executable code.
"""

import json
import sys
import traceback

import data_layer as dl
import introspect
from facts import facts_text


class InvalidRequest(Exception):
    """Malformed protocol payload, as opposed to a missing database entity."""


def _error(code, message, alternatives=None):
    result = {"ok": False, "code": code, "error": message}
    if alternatives:
        result["alternatives"] = alternatives
    return result


def _required_string(payload, key):
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise InvalidRequest("%s 必须是非空字符串" % key)
    return value


def _validate_keys(payload, allowed):
    unknown = set(payload) - allowed
    if unknown:
        raise InvalidRequest("不支持的请求字段：%s" % "、".join(sorted(unknown)))


def _validated_args(payload, ability):
    args = payload.get("args", {})
    if not isinstance(args, dict):
        raise InvalidRequest("args 必须是 JSON 对象")
    if any(not isinstance(key, str) for key in args):
        raise InvalidRequest("args 的参数名必须是字符串")
    unknown = set(args) - set(ability.args)
    if unknown:
        raise InvalidRequest("%s 不接受参数：%s" % (ability.name, "、".join(sorted(unknown))))
    for key, value in args.items():
        if not isinstance(value, str):
            raise InvalidRequest("参数 %s 必须是字符串" % key)
    return args


def _catalog(role):
    return [
        {"name": ability.name, "roles": list(ability.roles), "args": dict(ability.args),
         "doc": ability.doc, "write": ability.write}
        for ability in dl.CATALOG.values() if role in ability.roles
    ]


def handle(payload):
    """Validate one request, re-resolve its user, then return exactly one response."""
    try:
        if not isinstance(payload, dict):
            raise InvalidRequest("请求必须是 JSON 对象")
        action = _required_string(payload, "action")
        if action not in ("identity", "catalog", "invoke", "schema"):
            raise InvalidRequest("不支持的 action：%s" % action)
        _validate_keys(payload, {"action", "user"} if action != "invoke" else
                       {"action", "user", "ability", "args", "mode"})
        user = _required_string(payload, "user")
        identity = dl.resolve_identity(user)
        if identity is None:
            return _error("DENIED", "无法验证用户身份，请核对学号或教师号")
        scope = dl.derive_scope(identity)

        if action == "identity":
            return {"ok": True, "identity": {
                "role": identity["role"], "ref_id": identity["ref_id"],
                "display": identity["display"], "address": scope["address"],
                "scope_text": dl.scope_desc(scope),
            }}
        if action == "catalog":
            return {"ok": True, "catalog": _catalog(scope["role"])}
        if action == "schema":
            # The backstage view reads every table, so only the administrator may open it.
            if scope["role"] != "ADMIN":
                return _error("DENIED", "仅管理员可以查看后台库表结构")
            return {"ok": True, "schema": introspect.snapshot()}

        name = _required_string(payload, "ability")
        mode = payload.get("mode", "read")
        if not isinstance(mode, str) or mode not in ("read", "preview", "execute"):
            raise InvalidRequest("mode 必须是 read、preview 或 execute")
        ability = dl.CATALOG.get(name)
        if ability is None:
            return _error("NOT_FOUND", "我没有「%s」这项能力" % name,
                          [item["name"] for item in _catalog(scope["role"])])
        # Check permission BEFORE mode: an unauthorized caller must never invoke
        # a privileged ability, even via a read/preview request.
        dl._check_role(scope, ability)
        args = _validated_args(payload, ability)
        if mode == "read" and ability.write:
            raise InvalidRequest("写操作只能使用 preview 或 execute 模式")
        if mode != "read" and not ability.write:
            raise InvalidRequest("只读能力只能使用 read 模式")
        # The HTTP layer must require explicit user confirmation before sending
        # execute; this bridge does not receive or verify confirmation tokens.
        fact = dl.preview(scope, name, args) if mode == "preview" else dl.execute(scope, name, args)
        return {"ok": True, "fact": fact, "text": facts_text(fact["kind"], fact)}
    except InvalidRequest as exc:
        return _error("INVALID", str(exc))
    except dl.Denied as exc:
        return _error("DENIED", exc.detail or "权限不足", exc.alternatives)
    except dl.NotFound as exc:
        return _error("NOT_FOUND", exc.detail)
    except Exception:
        traceback.print_exc(file=sys.stderr)
        return _error("ERROR", "服务暂时不可用，请稍后再试")


def main():
    """Emit exactly one JSON response line for each JSON request line."""
    for stream in (sys.stdin, sys.stdout):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8")
    for line in sys.stdin:
        try:
            response = handle(json.loads(line))
        except (json.JSONDecodeError, UnicodeError):
            response = _error("INVALID", "请求不是有效的 JSON")
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
