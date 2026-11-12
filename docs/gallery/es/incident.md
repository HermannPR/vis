```kpi "Incidente 4512: pago lento" cols=2
- Duración: 47 min (bad)
- Pedidos afectados: 312 (warn)
- Latencia p95 máxima: 4.8 s (bad)
- Estado: resuelto (ok)
```

```chart line "Latencia p95 del pago" unit=s
hora,p95
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

```timeline "Qué pasó"
2026-11-03 14:02 | Salta la alerta de latencia | done
2026-11-03 14:09 | Se rastrea a una consulta lenta de tasas de impuesto | done
2026-11-03 14:31 | Se agrega un índice y se calienta el caché | done
2026-11-03 14:49 | Todo vuelve a la normalidad | done
2026-11-10 | Prueba de carga del servicio de impuestos | pending
```
