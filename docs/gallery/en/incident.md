```kpi "Incident 4512: slow checkout" cols=2
- Duration: 47 min (bad)
- Orders affected: 312 (warn)
- Peak p95 latency: 4.8 s (bad)
- Status: resolved (ok)
```

```chart line "Checkout p95 latency" unit=s
time,p95
2026-11-03 13:50,0.6
2026-11-03 14:00,0.7
2026-11-03 14:05,2.9
2026-11-03 14:10,4.8
2026-11-03 14:15,4.4
2026-11-03 14:20,4.1
2026-11-03 14:30,3.2
2026-11-03 14:40,1.9
2026-11-03 14:50,0.8
2026-11-03 15:00,0.6
```

```timeline "What happened"
2026-11-03 14:02 | Latency alert fires | done
2026-11-03 14:09 | Traced to a slow tax-rate query | done
2026-11-03 14:31 | Index added, cache warmed | done
2026-11-03 14:49 | Back to normal | done
2026-11-10 | Load test for the tax service | pending
```
