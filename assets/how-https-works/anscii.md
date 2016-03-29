```
客户端<------------攻击者<------------服务端
        伪造证书            拦截请求
```

```
+---------------------+
| A digital signature |
|(not to be confused  |
|with a digital       |
|certificate)         |            +---------+              +--------+
| is a mathematical   |----哈希--->| 消息摘要  |---私钥加密--->| 数字签名 |
|technique used       |            +---------+              +--------+
|to validate the      |
|authenticity and     |
|integrity of a       |
|message, software    |
|or digital document. |
+---------------------+

```

```
+---------------------+
| A digital signature |
|(not to be confused  |
|with a digital       |
|certificate)         |            +---------+
| is a mathematical   |----哈希--->|  消息摘要 |
|technique used       |            +---------+
|to validate the      |                 |
|authenticity and     |                 |
|integrity of a       |                 |
|message, software    |                 对
|or digital document. |                 比
+---------------------+                 |
                                        |
                                        |
          +--------+               +---------+ 
          | 数字签名 |---公钥解密--->|  消息摘要 | 
          +--------+               +---------+

```

```
empty state -------------------> pending state ------------------> current state
             Handshake Protocol                Change Cipher Spec
```
