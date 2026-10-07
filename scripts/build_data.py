"""구글 드라이브의 엑셀 파일을 내려받아 data.json으로 바꿉니다.

사용법: python scripts/build_data.py <출력 경로>
환경 변수 DRIVE_FILE_ID 로 파일 ID를 바꿀 수 있습니다.
"""
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

import openpyxl

FILE_ID = os.environ.get("DRIVE_FILE_ID", "1003PRolBSSJFwivZT3vd_Sprv-vR2UPv")
SHEETS = ["수업자동화", "업무자동화"]


def download(file_id: str) -> bytes:
    urls = [
        f"https://drive.google.com/uc?export=download&id={file_id}",
        f"https://docs.google.com/spreadsheets/d/{file_id}/export?format=xlsx",
    ]
    last = None
    for url in urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as res:
                data = res.read()
            if data[:2] == b"PK":  # xlsx(zip) 파일인지 확인
                return data
            last = f"{url} 에서 엑셀이 아닌 응답을 받음 (공유 설정 확인 필요)"
        except Exception as e:  # noqa: BLE001
            last = f"{url}: {e}"
    raise SystemExit(f"엑셀을 내려받지 못했습니다. {last}")


def clean(v) -> str:
    if v is None:
        return ""
    s = re.sub(r"[ \t]*\n[ \t]*", " ", str(v).strip())
    return re.sub(r" {2,}", " ", s)


def parse(wb) -> dict:
    out = {}
    for name in SHEETS:
        if name not in wb.sheetnames:
            raise SystemExit(f"'{name}' 탭을 찾지 못했습니다. 탭 이름을 확인하세요.")
        ws = wb[name]
        ideas, ref1, ref2, mode = [], [], [], None
        for r in ws.iter_rows(values_only=True):
            r = list(r) + [None] * (10 - len(r))
            a = r[0]
            if isinstance(a, str):
                if a.startswith("①"):
                    mode = 1; continue
                if a.startswith("②"):
                    mode = 2; continue
                if a.startswith("③"):
                    mode = 3; continue
                if a.strip() in ("출처 도서", "번호"):
                    continue
            if mode == 1 and a:
                ref1.append({"book": str(a).strip(), "order": clean(r[3]), "toc": str(r[4] or "").strip(), "why": clean(r[6])})
            elif mode == 2 and a:
                ref2.append({"book": clean(a), "apps": str(r[4] or "").strip()})
            elif mode == 3 and isinstance(a, (int, float)) and clean(r[3]):
                ideas.append({
                    "n": int(a), "cat": clean(r[1]), "stage": clean(r[2]), "name": clean(r[3]),
                    "scene": clean(r[4]), "tool": clean(r[5]), "who": clean(r[6]),
                    "link": clean(r[7]), "note": clean(r[8]),
                })
        out[name] = {"ideas": ideas, "ref1": ref1, "ref2": ref2}
    return out


FINAL_SHEET = "최종목차"
FINAL_COLS = {  # 머리글 글자 → 키 (머리글에 이 글자가 들어 있으면 그 열로 인식, 열 순서는 자유)
    "권": "book", "파트 번호": "partNo", "파트 제목": "part", "파트 설명": "partDesc", "꼭지 번호": "no",
    "꼭지 제목": "title", "세부": "items", "아이디어": "ideas", "저자": "author", "상태": "status", "비고": "note", "대체": "alt",
}


def norm_book(v: str) -> str:
    v = (v or "").strip()
    if v.startswith("수업"):
        return "수업자동화"
    if v.startswith("업무"):
        return "업무자동화"
    return v


def cell_text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return clean(v)


def parse_final(wb) -> list:
    """'최종목차' 탭을 읽습니다. 탭이 없으면 빈 목록."""
    if FINAL_SHEET not in wb.sheetnames:
        return []
    rows = list(wb[FINAL_SHEET].iter_rows(values_only=True))
    cols, start = None, None
    for idx, r in enumerate(rows):
        texts = [clean(v) for v in r]
        if "권" in texts and any("꼭지 제목" in t for t in texts):
            cols = {}
            for ci, t in enumerate(texts):
                for label, key in FINAL_COLS.items():
                    if key not in cols.values() and (t == label if label == "권" else label in t):
                        cols[ci] = key
                        break
            start = idx + 1
            break
    if cols is None:
        return []
    out = []
    for r in rows[start:]:
        item = {key: cell_text(r[ci]) if ci < len(r) else "" for ci, key in cols.items()}
        for ci, key in cols.items():  # 세부 내용은 줄바꿈을 살려 목록으로
            if key == "items":
                raw = str(r[ci]).strip() if ci < len(r) and r[ci] is not None else ""
                item["items"] = [clean(x).lstrip("-·• ").strip() for x in raw.splitlines() if clean(x).lstrip("-·• ").strip()]
        if not item.get("title") or item.get("title") == "예시" or (item.get("book") or "").startswith("예시"):
            continue
        item["book"] = norm_book(item.get("book", ""))
        out.append(item)
    return out


# 엑셀에서 다른 탭에 들어간 아이디어를 옮기는 규칙 (앱 이름 일부로 찾음)
MOVES = [
    {"from": "수업자동화", "to": "업무자동화", "name": "허들 게임", "who": "진정숙",
     "cat": "미분류", "stage": "상시"},
]


def apply_moves(sheets: dict) -> dict:
    for mv in MOVES:
        src, dst = sheets.get(mv["from"]), sheets.get(mv["to"])
        if not src or not dst:
            continue
        for idea in list(src["ideas"]):
            if mv["name"] in idea["name"] and idea["who"] == mv["who"]:
                src["ideas"].remove(idea)
                moved = dict(idea)
                moved["movedFrom"] = f'{mv["from"]} #{idea["n"]}'
                moved["origCat"], moved["origStage"] = idea["cat"], idea["stage"]
                moved["cat"], moved["stage"] = mv["cat"], mv["stage"]
                moved["n"] = max([i["n"] for i in dst["ideas"]] + [0]) + 1
                dst["ideas"].append(moved)
    return sheets


def main():
    dest = sys.argv[1] if len(sys.argv) > 1 else "data.json"
    wb = openpyxl.load_workbook(io.BytesIO(download(FILE_ID)), data_only=True)
    sheets = apply_moves(parse(wb))
    final = parse_final(wb)
    final_source = "sheet"
    draft = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "draft_toc.json")
    if not final and os.path.exists(draft):  # 엑셀에 '최종목차' 탭이 없으면 저장소의 가목차 초안 사용
        with open(draft, encoding="utf-8") as f:
            final = json.load(f)
        final_source = "draft"
    kst = datetime.now(timezone(timedelta(hours=9)))
    payload = {"updated": kst.strftime("%Y-%m-%d %H:%M"), "sheets": sheets, "final": final, "final_source": final_source}
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    print({k: len(v["ideas"]) for k, v in sheets.items()}, "최종목차", len(final), final_source, "→", dest)


if __name__ == "__main__":
    main()
