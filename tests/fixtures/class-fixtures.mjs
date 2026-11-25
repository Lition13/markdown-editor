const tick = String.fromCharCode(96);
export const classSamples = {
  table: `classDiagram
accTitle: 本地任务结构
accDescr: 保留属性、方法、修饰与类注释。
class Task["任务记录"] {
 <<entity>>
 +String title
 -bool done
 #int progress
 ~String owner
 +complete() bool
 +restore() void
}
note for Task "完整保留类说明<br>第二行补充"
Task "1" *-- "0..*" CheckItem: 包含`,
  namespaces: `classDiagram
namespace Work["工作区"] {
 namespace Inner["内部模型"] {
  class Task {
   +String title
  }
 }
 note "分组内的完整说明"
}
namespace Empty {
 note "待补充模型"
}
Task --> Result: 生成结果`,
  qualified: `classDiagram
namespace App.Models.Core {
 class Task
}
namespace App.Services {
 class Service
}
Task --> Service: 交付`,
  generics: `classDiagram
class Store~T~ {
 +List~T~ values
 +read() List~T~$
 #write(value T) bool*
 +load(List~List~T~~ source) List~T~
}
Store <|-- CachedStore`,
  modifiers: `classDiagram
class Service {
 <<interface>>
 +String defaultName$
 +execute() bool*
 +version() String$
}
Service <|.. LocalService: 实现`,
  relationships: `classDiagram
Parent <|-- Child: 继承
Whole *-- Part: 组合
Group o-- Item: 聚合
Source --> Target: 关联
Left -- Right: 双向关联
Client ..> Provider: 依赖
Contract <|.. Implementation: 实现
Before .. After: 虚线关联`,
  bothEnds: `classDiagram
A <|--|> B
C o--o D
E *--* F
G <..> H`,
  interfaces: `classDiagram
Service --() Readable
Writeable ()-- Service
Application --> Service: 使用`,
  quantities: `classDiagram
direction LR
Customer "1" --> "0..*" Order: 下单
Order "1" *-- "1..*" Item: 包含
Order "0..1" --> "1" Payment: 支付`,
  notes: `classDiagram
note "完整的全局说明"
class Task
note for Task "**完整注释**与*补充*<br>下一行信息"
Task --> Result`,
  styles: `classDiagram
class Task:::important {
 +String title
}
class Done
classDef important fill:#ffe4d1,stroke:#b06010,color:#283850,stroke-width:3px
style Done fill:#e6efff,stroke:#4c6ab7
Task --> Done`,
  styleFirst: `classDiagram
classDef important fill:#ffe4d1,stroke:#b06010,color:#283850
class Task
cssClass "Task" important`,
  defaults: `classDiagram
class Task
class Result:::special
classDef default fill:#e8f0ff,color:#283850
classDef special fill:#ffe4d1
Task --> Result`,
  literal: `classDiagram
class __proto__["字面原型 &amp; 保留"] {
 +List~String~ constructor
 +read() List~String~
}
class constructor["字面结果"]
__proto__ --> constructor: 原文保留
link __proto__ "https://example.test/no-network" "只读提示信息"
callback constructor "untrustedCallback" "回调提示信息"`,
  escaped: `classDiagram
class ${tick}Task Name!${tick} {
 +String value
}
class ${tick}Result Name${tick}
${tick}Task Name!${tick} --> ${tick}Result Name${tick}: 完整关系`,
  collisions: `classDiagram
namespace Work {
 class Work
}
class note0
note for note0 "不会覆盖同名类"
class interface0
Service --() Readable
Work --> note0
interface0 --> Service`,
  repeated: `classDiagram
A "1" --> "*" B: 第一条关系
A "0..1" --> "0..*" B: 第二条关系
B --> A: 返回
A --> A: 自连接`,
  long: `classDiagram
class Task["完整标题${"W".repeat(200)}"] {
 +String ${"完整属性".repeat(20)}
 +${"W".repeat(160)}() List~T~$
}
note for Task "完整注释${"W".repeat(240)}"
Task "完整数量${"W".repeat(160)}" --> "*" Result: 完整关系${"W".repeat(180)}`,
  ...Object.fromEntries(["TB", "BT", "LR", "RL"].map((direction) => ["direction" + direction, `classDiagram
direction ${direction}
class A["起始类"]
class B["后续类"]
A "1" --> "*" B: 按方向关联`])),
};
