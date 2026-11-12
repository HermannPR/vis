# Store, week 44

Summary an agent put together from **sample data**.

```kpi "Key numbers this week"
- Revenue: $184,300 (+12 %, ok)
- Orders: 1,240 (+3 %, ok)
- Returns: 4.8 % (+1.1 pts, warn)
- Customer reply time: 6 h (+2 h, bad)
```

```chart bar "Orders this week by channel" labels=true
channel,orders
Web,342
App,264
Store,236
Social,193
Wholesale,125
Phone,80
```

```progress "New online store"
- [x] Design
- [x] Catalog loaded
- [~] Payments in testing (70 %)
- [ ] Customer trial
```

```timeline "New store milestones"
2026-10-28 | Design | done
2026-11-03 | Catalog loaded | done
2026-11-06 | Payments in testing | in progress
2026-11-12 | Launch | pending
```

```compare "Current site vs the new one" before="Current" after="New" better=lower
Page load | 4.2 s | 1.3 s
Failed payments per week | 31 | 4
```

```decisions "How do we launch?"
date | When do we launch the new store? | Nov 12* ~ as planned | Nov 19 ~ one more week of testing | @date
notify+ | Where do we tell customers? | Email | Social | WhatsApp
```
