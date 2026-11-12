```compare "Checkout button test, 14 days" before="A: Pay now" after="B: Complete order" better=higher
Conversion | 3.1 % | 3.6 %
Average order | $48.20 | $49.10
Orders | 1,242 | 1,447
```

```chart bar "Conversion by device" unit=% labels=true
device,A,B
Phone,2.6,3.3
Tablet,3.0,3.4
Desktop,3.9,4.1
```

```decisions "Next step"
ship | Ship B? | To everyone* ~ +16 % orders, significant | 50 % for another week | Keep A
```
