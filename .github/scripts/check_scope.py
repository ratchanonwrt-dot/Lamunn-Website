"""ตรวจว่า PR แตะเฉพาะไฟล์ที่ทีมของผู้เปิด PR มีสิทธิ์แก้

เรียกจาก .github/workflows/accounting-pr-check.yml (status check ชื่อ accounting-scope ซึ่งตั้งเป็น required
ใน ruleset ของ master — ชื่อ job ต้องคงเดิม ไม่งั้น ruleset จะรอ check ที่ไม่มีวันมา)

ทำไมผูกสิทธิ์กับ "บัญชี GitHub ของผู้เปิด PR" ไม่ใช่ชื่อ branch: ชื่อ branch ใครจะตั้งอะไรก็ได้ แต่ login ปลอมไม่ได้
และไฟล์นี้อยู่ใน .github/ ซึ่งทุกทีมห้ามแตะ จึงไม่มีใครเพิ่มสิทธิ์ให้ตัวเองได้

ต้องตรงกับตาราง "ใครแก้อะไรได้" ใน AGENTS.md เสมอ
"""
import os
import re
import subprocess
import sys

OWNER = "ratchanonwrt-dot"

# login GitHub -> ทีม  (คนที่ไม่อยู่ในรายการนี้และไม่ใช่เจ้าของ จะเปิด PR ได้แต่ merge ไม่ได้)
USERS = {
    "sutineesuw-hue": "accounting",
}

# ส่วนที่เจ้าของสงวนไว้ — ทีมบัญชีห้ามแตะ (นโยบาย deny ตั้งแต่ 2026-09-22)
OWNER_RESERVED = [
    r"Lamunn-Finance/src/app/\(app\)/(company-status|reports|monthly|credit-term|cash-status|dashboard|investment-cost)/",
    r"Lamunn-Finance/src/app/api/(company-status|company-channel|daily-sales|credit-term|cash-adjustments|investment-costs|export|dividend-payments|gp-rate-history|billing-groups|branch-billing)/",
    r"Lamunn-Finance/src/lib/(finance|reportsCalc|sssgCalc|creditTermCalc|billingCalc|billingPdf|gpRateHistory|rentCalc|exportXlsx)\.tsx?$",
    r"Lamunn-Finance/src/components/(charts/|ExportPanel|BackgroundSync|RankingFilterBar|BranchSalesFilterBar|BranchDailyMatrix|EditableMonthlyChannelTable|CompanyStatusLive"
    r"|CreditTermStatusButton|CreditTermCycleForm|CancelCreditTermButton|GenerateCreditTermButton|AddManualCreditTermForm"
    r"|BranchBillingRow|BranchBillingGroupAssign|BillingGroupSettings"
    r"|AddCashAdjustmentForm|DeleteCashAdjustmentButton|AddInvestmentCostForm|DeleteInvestmentCostButton|InvestmentResaleCell)",
    r"\.github/",
]

TEAMS = {
    # บัญชี: แก้ได้ทั้งแอป Lamunn-Finance ยกเว้นส่วนที่เจ้าของสงวนไว้
    "accounting": {
        "label": "ทีมบัญชี",
        "deny": OWNER_RESERVED,
        "models": ("Acc", "VatRole"),
        "sql_names": ("acc_", "Acc", "VatRole"),
    },
    # Catering: แก้ได้เฉพาะไฟล์ของระบบ catering (allowlist) — ส่วนอื่นของเว็บต้องให้เจ้าของทำ
    "catering": {
        "label": "ทีม Catering",
        "allow": [
            r"Lamunn-Finance/src/app/\(app\)/catering/",
            r"Lamunn-Finance/src/app/api/catering/",
            r"Lamunn-Finance/src/components/catering/",
            r"Lamunn-Finance/src/lib/(catering[A-Za-z]*|pickupOrderItemsTotal)\.tsx?$",
            r"Lamunn-Finance/scripts/verify-catering[^/]*\.ts$",
            r"Lamunn-Finance/docs/CATERING[^/]*\.md$",
            r"Lamunn-Catering/",
            r"packages/db-finance/prisma/schema\.prisma$",
            r"packages/db-finance/prisma/migrations/",
        ],
        # Customer / CustomerSource ใน db-finance คือลูกค้า catering (ใช้เฉพาะหน้า catering) ไม่ใช่ลูกค้า CRM
        "models": ("Catering", "PickupOrder", "Customer"),
        "sql_names": ("catering_", "pickup_order", "customers", "Catering", "PickupOrder", "Customer"),
    },
}

SCHEMA = "packages/db-finance/prisma/schema.prisma"
MIGRATIONS = "packages/db-finance/prisma/migrations/"
SQL_KEYWORDS = {"DELETE", "UPDATE", "CASCADE", "NULL", "RESTRICT", "SET", "NOT", "EXISTS", "IF"}


def fail(msg: str, files=()):
    print(f"::error::{msg}")
    for f in files:
        print(f"  - {f}")
    sys.exit(1)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def main():
    author = os.environ["PR_AUTHOR"]
    base = os.environ["BASE_REF"]
    if author == OWNER:
        print(f"เจ้าของ repo ({author}) — ข้ามการตรวจขอบเขต")
        return

    team_key = USERS.get(author)
    if not team_key:
        fail(f"บัญชี GitHub '{author}' ยังไม่ได้ลงทะเบียนทีมใน .github/scripts/check_scope.py — ให้เจ้าของ repo เพิ่มก่อน")
    team = TEAMS[team_key]

    changed = [f for f in git("diff", "--name-only", f"origin/{base}...HEAD").splitlines() if f]
    print(f"ผู้เปิด PR: {author} ({team['label']})")
    print("ไฟล์ที่เปลี่ยน:\n  " + "\n  ".join(changed))

    if "deny" in team:
        bad = [f for f in changed if any(re.match(p, f) for p in team["deny"])]
        if bad:
            fail(f"{team['label']} แตะส่วนที่เจ้าของสงวนไว้ — ต้องให้เจ้าของ repo ตรวจและ merge เอง:", bad)
    else:
        bad = [f for f in changed if not any(re.match(p, f) for p in team["allow"])]
        if bad:
            fail(f"{team['label']} แตะไฟล์นอกขอบเขตของทีม — ต้องให้เจ้าของ repo ตรวจและ merge เอง:", bad)

    # schema.prisma ใช้ร่วมทุกระบบ — แก้ได้เฉพาะ model/enum ของทีมตัวเอง
    if SCHEMA in changed:
        diff = git("diff", f"origin/{base}...HEAD", "--", SCHEMA)
        touched = set(re.findall(r"^@@[^@]*@@\s*(?:model|enum)\s+(\w+)", diff, re.M))
        touched |= set(re.findall(r"^[+-]\s*(?:model|enum)\s+(\w+)", diff, re.M))
        bad = sorted(n for n in touched if not n.startswith(team["models"]))
        if bad:
            fail(f"schema.prisma ถูกแก้นอก model/enum ของ{team['label']} ({' / '.join(p + '*' for p in team['models'])}):", bad)

    # migration ใหม่ต้องแตะเฉพาะตาราง/ชนิดข้อมูลของทีมตัวเอง (อ้างอิง REFERENCES ไปตารางอื่นได้)
    for f in changed:
        if not (f.startswith(MIGRATIONS) and f.endswith(".sql")):
            continue
        try:
            sql = open(f, encoding="utf-8").read()
        except FileNotFoundError:
            continue  # ลบไฟล์ — ไม่ต้องตรวจเนื้อหา
        names = re.findall(
            r'\b(?:TABLE|ON|TYPE)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:"?\w+"?\.)?"?([A-Za-z_]\w*)"?', sql, re.I
        )
        bad = sorted({n for n in names if n.upper() not in SQL_KEYWORDS and not n.startswith(team["sql_names"])})
        if bad:
            fail(f"{f} แตะตาราง/ชนิดข้อมูลนอกขอบเขตของ{team['label']}:", bad)

    print(f"ผ่าน: ทุกไฟล์อยู่ในขอบเขตของ{team['label']}")


if __name__ == "__main__":
    main()
