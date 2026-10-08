# Invexom EMS — License Bechne Ka Poora Process (Seller Guide)

Ye guide aapke liye hai (seller). Customer ko sirf installer + ye 4 steps samjhane hain.

---

## 1. Model samjho (customer ko kya bech rahe ho)

- **One-time payment, lifetime use.** Koi subscription nahi, koi renewal nahi, koi internet check nahi.
- License ek **signed file** (`.inelic`) hai jo customer ke **computer se lock** hoti hai (hardware binding).
- Paid license me **koi expiry date nahi** — ek baar activate, lifetime chalega.
- **Demo (free trial):** 50 students, 30 din, watermark. Demo khatam hone par app read-only ho jata hai — data delete nahi hota.
- License lene par demo ka saara data **waisa ka waisa** rehta hai — kuch dobara dalna nahi padta.

**Tiers:**
| Tier | Students | Devices | Suggested price |
|------|----------|---------|-----------------|
| Starter | 300 | 2 | ₹24,999 |
| Standard | 1000 | 5 | ₹39,999 |
| Campus | Unlimited | 10 | ₹59,999 |
| Add-ons (Transport / Library) | — | — | ₹4,999 each |

---

## 2. Customer ko software dena

1. Customer ko `Invexom-EMS-Setup-1.0.0.exe` bhejo (aapke GitHub Actions artifact se download kiya hua).
2. Customer install karke kholta hai → **Setup Wizard** (5 steps) → apna school data dalta hai.
3. App **Demo mode** me chalta hai — customer aaram se 30 din try kar sakta hai.

---

## 3. License issue karna (jab customer payment kar de)

**Step 1 — Payment lo.** Payment ka tareeka aapka (UPI / bank / Razorpay link — jo aap use karte ho). Payment confirm hone ke baad hi license banao.

**Step 2 — Customer se "License Request" mango.**
Customer ko bolo:
1. App kholo → left menu me **License** par click karo.
2. **"Copy license request"** button dabao.
3. Jo text copy hua hai, woh WhatsApp/email par bhejo.

Us text me ye hota hai:
```
Invexom EMS License Request
Machine Code: XXXX-XXXX-XXXX-XXXX
HW: disk=... board=... cpu=...
```

**Step 3 — License file banao (aapke PC par).**
Aapke project folder me terminal kholo (`C:\invexom-ems` ya jahan repo hai):

```bash
npm run make:license -- --tier standard --issuedTo "Sunrise Public School" --out "Sunrise-Public-School.inelic" --request "<customer ne jo text bheja, woh yahan paste karo>"
```

- `--tier`: `starter`, `standard`, ya `campus` (customer ne jo kharida).
- Add-ons kharide hon to end me `--transport 1` ya `--library 1` jodo.
- Ye command aapki **private key** (`~/workspace/invexom-ops/ems-private/license-private.pem`) se file sign karti hai.

**Step 4 — `.inelic` file customer ko bhejo** (WhatsApp/email). Bas.

**Step 5 — Customer activate karta hai:**
1. App me **License** screen kholo.
2. **"Activate with license file"** → bheji hui `.inelic` file chuno.
3. Done — demo banner gayab, full version lifetime ke liye.

---

## 4. Aam situations

- **Customer ne naya computer liya:** Purani license naye PC par kaam nahi karegi (hardware lock). Customer se nayi "License Request" mangwao aur nayi `.inelic` bana kar bhejo. (Policy aapki: dobara paise lene hain ya goodwill me free — recommend: pehli baar free re-issue.)
- **Windows reinstall / app reinstall:** Data folder me license info rehti hai. Agar customer ne uninstall me "keep school data" chuna tha to license bani rehti hai. Nahi to nayi request → nayi file.
- **Demo expire ho gaya, customer abhi kharidna chahta hai:** Koi dikkat nahi — license activate karte hi saara data wapas editable ho jata hai.
- **Ek se zyada computer (devices limit):** Har device ki apni machine code hoti hai. Tier ke hisaab se utne devices ki file banao (Starter=2, Standard=5, Campus=10).

---

## 5. Sabse zaroori: Private Key ki suraksha

- `license-private.pem` jiske paas hai, woh **khud license bana sakta hai** — ye aapke business ki chaabi hai.
- Iska **backup** offline rakho (pen drive / likha hua paper, locker me).
- Ye file **kabhi** customer ko mat bhejo, GitHub par mat dalo, WhatsApp par mat bhejo.
- Agar ye leak ho jaye to koi bhi free license bana lega — phir nayi key banani padegi aur saare customers ko nayi file deni padegi.

---

## 6. Ek line me poora business flow

**Installer bhejo → Customer demo chalaye → Payment lo → License Request mango → `.inelic` banao → bhejo → Customer activate kare → Lifetime use. Khatam.**
