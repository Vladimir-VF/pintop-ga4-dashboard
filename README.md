# pin.top — GA4 Analytics

Маркетинг-аналітика pin.top: довгостроковий дашборд + тижневі звіти по платних запусках.

## Що є

- **[📊 GA4 Dashboard (24 місяці)](https://vladimir-vf.github.io/pintop-ga4-dashboard/)** — глибокий аудит трафіку за 2024–2026
- **Weekly reports** — тижневі зрізи з розбивкою по каналах, UTM і кампаніях:
  - [14–20 квітня 2026](./weekly-2026-04-20.md) — TikTok relaunch + Meta launch

## Джерела даних

- GA4 Data API v1beta — property 358528411
- TikTok Marketing API v1.3 — advertiser 7587396752228171783
- Google Ads API v23 — customer 3651749366

## Cadence

Тижневі звіти генеруються автоматично по понеділках о 9:00 (scheduled task `pintop-analytics-weekly-refresh`) і коміт в цей репозиторій.

---

© 2026 pin.top · Volodymyr Fedorov
