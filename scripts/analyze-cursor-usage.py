#!/usr/bin/env python3
"""Analyze Cursor agent transcripts — repos reais, subagents e modelos caros."""
from __future__ import annotations

import argparse
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

# WSL default; override with --projects-root
DEFAULT_PROJECTS = Path("/mnt/c/Users/995670.CLAMED/.cursor/projects")
WS_NAME = "c-Users-995670-CLAMED-Desenvolvimentos"

TASK_RE = re.compile(r'"name"\s*:\s*"Task"')
OPUS_TASK_RE = re.compile(
    r'"name"\s*:\s*"Task"[^}]*claude-opus-5-thinking-high', re.DOTALL
)
SUBAGENT_RE = re.compile(r'"subagent_type"\s*:\s*"([^"]+)"')
MODEL_TASK_RE = re.compile(
    r'"name"\s*:\s*"Task"[^}]*?"model"\s*:\s*"([^"]+)"', re.DOTALL
)
# Só paths de pasta no workspace — ignora npm (@clamed/logger), imports, skills
REPO_PATH_RE = re.compile(
    r"Desenvolvimentos[\\/](?:"
    r"01-PROJECTS[\\/](?:ACTIVE|MAINTENANCE)[\\/]|"
    r"02-KNOWLEDGE[\\/][^\\/]+[\\/]|"
    r"03-LIBRARIES[\\/]INTERNAL[\\/]"
    r")?([\w\-.]+)",
    re.I,
)
SKIP_REPO_NAMES = frozenset(
    {
        "01-PROJECTS",
        "02-KNOWLEDGE",
        "03-LIBRARIES",
        "05-SCRIPTS",
        "06-TEMPLATES",
        "99-ARCHIVE",
        "00-INBOX",
        "ACTIVE",
        "MAINTENANCE",
        "INTERNAL",
        "SYBASE",
        "scripts",
        "agent-transcripts",
        "terminals",
        "kafka-dev",
    }
)
# Menções a pacote npm (não é repo trabalhado)
NPM_NOISE_RE = re.compile(r"@?clamed/logger|skills/logger", re.I)


def normalize_repo(raw: str) -> str | None:
    name = raw.replace("\\", "/").strip("/")
    if not name or name in SKIP_REPO_NAMES:
        return None
    return name


def extract_repos(text: str) -> Counter[str]:
    c: Counter[str] = Counter()
    for hit in REPO_PATH_RE.findall(text):
        repo = normalize_repo(hit)
        if repo:
            c[repo] += 1
    return c


def scan_file(path: Path, month: str | None) -> dict | None:
    if month:
        mtime = datetime.fromtimestamp(path.stat().st_mtime)
        if mtime.strftime("%Y-%m") != month:
            return None
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    first_user = ""
    for line in lines:
        if not first_user and '"role":"user"' in line and '"type":"text"' in line:
            m = re.search(r'"text":"([^"]{0,200})', line)
            if m:
                first_user = m.group(1).replace("\\n", " ")[:120]
    return {
        "bytes": path.stat().st_size,
        "lines": len(lines),
        "tasks": len(TASK_RE.findall(text)),
        "opus_tasks": len(OPUS_TASK_RE.findall(text)),
        "subagents": Counter(SUBAGENT_RE.findall(text)),
        "task_models": Counter(MODEL_TASK_RE.findall(text)),
        "first_user": first_user,
        "repos": extract_repos(text),
        "npm_logger_mentions": len(NPM_NOISE_RE.findall(text)),
    }


def analyze_chat(chat_dir: Path, month: str | None) -> dict | None:
    cid = chat_dir.name
    main = chat_dir / f"{cid}.jsonl"
    if not main.exists():
        return None
    if month and scan_file(main, month) is None:
        # check if any subagent in month
        sub_dir = chat_dir / "subagents"
        if not sub_dir.is_dir():
            return None
        subs_in_month = [
            f for f in sub_dir.glob("*.jsonl") if scan_file(f, month) is not None
        ]
        if not subs_in_month and scan_file(main, None) is None:
            return None

    agg = {
        "id": cid,
        "bytes": 0,
        "tasks": 0,
        "opus_tasks": 0,
        "subs": 0,
        "subagents": Counter(),
        "task_models": Counter(),
        "repos": Counter(),
        "npm_logger_mentions": 0,
        "first_user": "",
    }
    files = [main]
    sub_dir = chat_dir / "subagents"
    if sub_dir.is_dir():
        files.extend(sorted(sub_dir.glob("*.jsonl")))
    for f in files:
        info = scan_file(f, month)
        if info is None:
            continue
        if f.parent.name == "subagents":
            agg["subs"] += 1
        agg["bytes"] += info["bytes"]
        agg["tasks"] += info["tasks"]
        agg["opus_tasks"] += info["opus_tasks"]
        agg["subagents"].update(info["subagents"])
        agg["task_models"].update(info["task_models"])
        agg["repos"].update(info["repos"])
        agg["npm_logger_mentions"] += info["npm_logger_mentions"]
        if not agg["first_user"] and info["first_user"]:
            agg["first_user"] = info["first_user"]
    if agg["bytes"] == 0:
        return None
    return agg


def print_report(chats: list[dict], month: str | None) -> None:
    label = f" ({month})" if month else ""
    print(f"=== RELATÓRIO DE USO IA{label} ===\n")

    print("=== TOP 12 CHATS (tamanho de log) ===")
    for c in sorted(chats, key=lambda x: x["bytes"], reverse=True)[:12]:
        mb = c["bytes"] / (1024 * 1024)
        pro = c["subagents"].get("desenvolvimento-pro", 0)
        arch = c["subagents"].get("arquitetura-pro", 0)
        rev = c["subagents"].get("review-pro", 0)
        flags = []
        if pro > 0:
            flags.append(f"⚠ Pro aninhado={pro}")
        if c["opus_tasks"] > 0:
            flags.append(f"⚠ Opus tasks={c['opus_tasks']}")
        if arch > 1:
            flags.append(f"⚠ ARCH relançada={arch}")
        flag_s = " | " + ", ".join(flags) if flags else ""
        print(
            f"{c['id'][:8]} | {mb:.2f} MB | subs={c['subs']} tasks={c['tasks']} "
            f"arch={arch} review={rev}{flag_s}"
        )
        top_repo = c["repos"].most_common(1)
        if top_repo:
            print(f"  repo: {top_repo[0][0]} ({top_repo[0][1]} paths)")
        if c["first_user"]:
            print(f"  1ª msg: {c['first_user'][:90]}...")
        print()

    global_sub: Counter[str] = Counter()
    global_models: Counter[str] = Counter()
    repo_global: Counter[str] = Counter()
    total_npm_logger = 0
    chats_arch_multi = 0
    chats_pro_nest = 0
    chats_opus = 0

    for c in chats:
        global_sub.update(c["subagents"])
        global_models.update(c["task_models"])
        repo_global.update(c["repos"])
        total_npm_logger += c["npm_logger_mentions"]
        if c["subagents"].get("arquitetura-pro", 0) > 1:
            chats_arch_multi += 1
        if c["subagents"].get("desenvolvimento-pro", 0) > 0:
            chats_pro_nest += 1
        if c["opus_tasks"] > 0:
            chats_opus += 1

    print("=== REPOS (só pastas em Desenvolvimentos/…) ===")
    print("(Menções a @clamed/logger em imports/spec NÃO entram aqui.)\n")
    for path, n in repo_global.most_common(15):
        print(f"  {path}: {n}")
    print(f"\n  [info] menções npm/skill @clamed/logger (ruído): {total_npm_logger}")

    print("\n=== SUBAGENTS ===")
    for name, n in global_sub.most_common(12):
        print(f"  {name}: {n}")

    print("\n=== TASK MODELS ===")
    for name, n in global_models.most_common(10):
        print(f"  {name}: {n}")

    print("\n=== ALERTAS DE CUSTO ===")
    print(f"  Chats com Pro aninhado: {chats_pro_nest}")
    print(f"  Chats com Opus em Task: {chats_opus}")
    print(f"  Chats com ARCH >1 (relançada): {chats_arch_multi}")
    print(f"  Total Opus Tasks: {sum(c['opus_tasks'] for c in chats)}")
    print(f"  Total Pro aninhado (refs): {global_sub.get('desenvolvimento-pro', 0)}")
    print(f"  Total arquitetura-pro: {global_sub.get('arquitetura-pro', 0)}")
    print(f"  Total review-pro: {global_sub.get('review-pro', 0)}")
    print(f"\n  Chats analisados: {len(chats)}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Analisa uso de IA nos transcripts Cursor")
    parser.add_argument(
        "--projects-root",
        type=Path,
        default=DEFAULT_PROJECTS,
        help="Pasta .cursor/projects",
    )
    parser.add_argument(
        "--workspace",
        default=WS_NAME,
        help="Nome da pasta do projeto Cursor",
    )
    parser.add_argument(
        "--month",
        metavar="YYYY-MM",
        help="Filtrar por mês (mtime dos arquivos jsonl)",
    )
    args = parser.parse_args()

    ws = args.projects_root / args.workspace / "agent-transcripts"
    if not ws.is_dir():
        print(f"ERRO: pasta não encontrada: {ws}", file=sys.stderr)
        return 1

    chats = [
        c
        for d in sorted(ws.iterdir())
        if d.is_dir()
        for c in [analyze_chat(d, args.month)]
        if c
    ]
    print_report(chats, args.month)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
