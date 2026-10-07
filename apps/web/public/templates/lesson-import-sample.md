---
title: Closure trong JavaScript
isPreview: false
isRequired: true
---

## Closure là gì?

Một **closure** là hàm "nhớ" được phạm vi nơi nó được tạo ra.

```js
const add = (a) => (b) => a + b;
add(2)(3); // 5
```

- Dùng để đóng gói dữ liệu
- Dùng trong callback và factory function

Tham khảo thêm tại [MDN](https://developer.mozilla.org/docs/Web/JavaScript/Closures).
