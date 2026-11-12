```compare "Prueba del botón de pago, 14 días" before="A: Pagar ahora" after="B: Completar pedido" better=higher
Conversión | 3.1 % | 3.6 %
Pedido promedio | $48.20 | $49.10
Pedidos | 1,242 | 1,447
```

```chart bar "Conversión por dispositivo" unit=% labels=true
dispositivo,A,B
Celular,2.6,3.3
Tableta,3.0,3.4
Computadora,3.9,4.1
```

```decisions "Siguiente paso"
ship | ¿Lanzamos B? | Para todos* ~ +16 % de pedidos, significativo | 50 % una semana más | Dejar A
```
