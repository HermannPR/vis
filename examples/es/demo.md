# Semana 44 de la tienda

Resumen que armó un agente con **datos de prueba**.

```kpi "Indicadores de la semana"
- Ventas: $184,300 (+12 %, ok)
- Pedidos: 1,240 (+3 %, ok)
- Devoluciones: 4.8 % (+1.1 pts, alerta)
- Respuesta a clientes: 6 h (+2 h, mal)
```

```chart bar "Pedidos de la semana por canal" labels=true
canal,pedidos
Web,342
App,264
Tienda,236
Redes,193
Mayoristas,125
Llamadas,80
```

```progress "Nueva tienda en línea"
- [x] Diseño
- [x] Catálogo cargado
- [~] Pagos en prueba (70 %)
- [ ] Prueba con clientes
```

```timeline "Hitos de la nueva tienda"
2026-10-28 | Diseño | listo
2026-11-03 | Catálogo cargado | listo
2026-11-06 | Pagos en prueba | en curso
2026-11-12 | Lanzamiento | pendiente
```

```compare "Sitio actual contra el nuevo" before="Actual" after="Nuevo" better=lower
Carga de página | 4.2 s | 1.3 s
Pagos fallidos por semana | 31 | 4
```

```decisions "¿Cómo lanzamos?"
fecha | ¿Cuándo lanzamos la nueva tienda? | 12 nov* ~ lo planeado | 19 nov ~ una semana más de pruebas | @fecha
aviso+ | ¿Por dónde avisamos a los clientes? | Correo | Redes | WhatsApp
```
