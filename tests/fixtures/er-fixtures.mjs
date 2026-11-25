export const erSamples = {
  table: `erDiagram
accTitle: 本地工作区模型
accDescr: 字段类型、名称、键和说明都应完整保留。
TASK[任务] {
 string id PK "任务唯一编号"
 string listId FK "所属清单"
 string title "完整字段说明"
 int progress "完成百分比"
 bool done "是否完成"
}
LIST[清单] {
 string id PK "清单唯一编号"
 string name UK "不能重复的名称"
}
LIST ||--o{ TASK : 包含`,
  keys: `erDiagram
LINK {
 string ownerId PK,FK "组合主键与外键"
 string targetId PK,FK "指向目标任务"
 string slug UK "唯一索引"
 string code PK,FK,UK "三个键同时保留"
 string notes "没有键的普通字段"
}`,
  types: `erDiagram
STORE {
 List~String~ tags "保留泛型类型"
 string[] names "数组类型"
 decimal(10,2) amount "带精度的数值"
 int* code "星号字段类型"
 string \`field with spaces\` "带空格的字段名称"
}`,
  aliases: `erDiagram
"Task List"["**任务清单**"] {
 string name "清单名称"
}
TASK["_待办任务_ · Task"] {
 string title "原始任务标题"
}
"Task List" ||--o{ TASK : "**包含** _任务_"`,
  groups: `erDiagram
subgraph Work[工作区]
 TASK[任务] {
  string title "分组内字段说明"
 }
 LIST[清单]
 LIST ||--o{ TASK : 包含
end
USER[使用者]
USER ||--o{ TASK : 管理`,
  nested: `erDiagram
direction LR
subgraph App[本地应用]
 direction TB
 subgraph Work[工作数据]
  TASK[任务]
  LIST[清单]
  TASK }o--|| LIST : 所属
 end
 subgraph Audit[审计数据]
  LOG[日志] {
   string content "操作详情"
  }
 end
 TASK ||--o{ LOG : 产生
end
USER[使用者]
USER ||--o{ TASK : 编辑`,
  emptyGroup: `erDiagram
subgraph Future[待扩展模型]
end
TASK {
 string title "已存在字段"
}`,
  collision: `erDiagram
subgraph Work[工作域]
 Work[工作实体] {
  string title "不会丢失的同名实体字段"
 }
end
Work ||--o{ TASK : 分组关系`,
  groupLinks: `erDiagram
subgraph Work[工作区]
 TASK[任务]
end
subgraph Life[生活区]
 HABIT[习惯]
end
Work ||--o{ Life : 关联分组`,
  styles: `erDiagram
TASK:::special {
 string title "安全配色与字段说明"
}
LIST
TASK }o--|| LIST : 所属
classDef special fill:#ffe4d1,stroke:#b06010,color:#283850,stroke-width:3px
style LIST fill:#e6f0ff,stroke:#325a9e,stroke-width:2px`,
  styleFirst: `erDiagram
classDef special fill:#ffe4d1,stroke:#b06010,color:#283850,stroke-width:3px
TASK:::special {
 string title "提前定义的颜色"
}
LIST
TASK }o--|| LIST : 所属`,
  defaultStyle: `erDiagram
classDef default fill:#e6f2ed,stroke:#35735a,color:#183d2d
classDef special fill:#ffe4d1,stroke:#b06010
TASK:::special {
 string title "覆盖默认颜色"
}
LIST {
 string name "默认颜色"
}
LIST ||--o{ TASK : 包含`,
  relationships: `erDiagram
direction LR
ROOT |o--o| N00 : 关系00
ROOT |o--|| N01 : 关系01
ROOT |o--o{ N02 : 关系02
ROOT |o--|{ N03 : 关系03
ROOT ||--o| N10 : 关系10
ROOT ||--|| N11 : 关系11
ROOT ||--o{ N12 : 关系12
ROOT ||--|{ N13 : 关系13
ROOT }o--o| N20 : 关系20
ROOT }o--|| N21 : 关系21
ROOT }o--o{ N22 : 关系22
ROOT }o--|{ N23 : 关系23
ROOT }|--o| N30 : 关系30
ROOT }|--|| N31 : 关系31
ROOT }|--o{ N32 : 关系32
ROOT }|--|{ N33 : 关系33`,
  identifying: `erDiagram
A ||--o{ B : 标识关系
A ||..o{ C : 非标识关系
C }|..|{ B : 多对多`,
  aliasesForCardinality: `erDiagram
A one or zero to zero or more B : 自然语言关系
B one or more optionally to only one C : 可选标识关系`,
  selfAndParallel: `erDiagram
TASK {
 string parentId FK "父任务编号"
 string title "任务说明"
}
TASK |o--o{ TASK : 父子任务
TASK }o--|| LIST : 所属清单
TASK }o..|| LIST : 关联清单`,
  literal: `erDiagram
"__proto__"[原型名称] {
 string constructor PK "字面字段名"
 string value "Store#lt;T#gt; #38; #9829;"
}
constructor[构造名称] {
 string title "#lt;script#gt;literal#lt;/script#gt;"
}
"__proto__" ||--o{ constructor : "#lt;literal#gt; 关系"`,
  long: `erDiagram
TASK[很长的任务模型名称需要换行并完整保留] {
 List~LongTypeName~ veryLongFieldNameForSavedWorkspace "本字段的完整说明包含任务、清单、层级、日志、统计与恢复等信息，长文字需要完整显示。"
 string summary "WWW MMM @@@ 宽字符仍然留在字段边界内"
}
LIST[用于保存工作区中全部清单及归属关系的模型]
TASK ||--o{ LIST : "关系说明也应完整换行而不压住连接线"`,
  directionTB: `erDiagram
direction TB
A[起点]
B[终点]
A ||--o{ B : 关系说明`,
  generatedCollision: `erDiagram
A["实体 A"]
subgraph entity-A-0[分组恰好使用内部标识]
  CHILD[子实体]
end
A ||--o{ CHILD : 实体来源
entity-A-0 ||--o{ CHILD : 分组来源`,
  collisionEmpty: `erDiagram
subgraph Domain
  Domain
end`,
  nestedCollision: `erDiagram
subgraph Outer[外层模型]
  subgraph Inner[内层模型]
    Inner[同名实体] {
      string title "嵌套中保留全部字段"
    }
  end
end`,
  groupCreatedLater: `erDiagram
subgraph First[先声明的分组]
  Later[先声明的实体] {
    string title "原先的实体归属"
  }
end
subgraph Later[后声明的同名分组]
  CHILD[子实体]
end`,
  directionBT: `erDiagram
direction BT
A[起点]
B[终点]
A ||--o{ B : 关系说明`,
  directionLR: `erDiagram
direction LR
A[起点]
B[终点]
A ||--o{ B : 关系说明`,
  directionRL: `erDiagram
direction RL
A[起点]
B[终点]
A ||--o{ B : 关系说明`,
};
