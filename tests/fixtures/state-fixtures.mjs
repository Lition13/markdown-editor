export const stateSamples = {
  lifecycle: `stateDiagram-v2
accTitle: 任务状态流转
accDescr: 同一状态保留标题、后续说明与流转条件。
state "待审核" as Review
Review: 核对全部材料
Review: 记录审核结果
[*] --> Review
Review --> Done: 审核通过
Done --> [*]`,
  composite: `stateDiagram-v2
state "发布流程" as Release {
 [*] --> Draft
 state "逐层审阅" as Review {
  [*] --> Check
  Check: 检查资料
  Check --> Accepted
  Accepted --> [*]
 }
 Draft --> Review
}
state Empty {
}
[*] --> Release
Release --> Empty: 移交`,
  regions: `stateDiagram-v2
state "同时准备" as Active {
 [*] --> Fetch
 Fetch: 下载资料
 Fetch --> Cached
 --
 [*] --> Prepare
 Prepare: 准备清单
 Prepare --> Ready
}
[*] --> Active
Active --> Done`,
  controls: `stateDiagram-v2
state Branch <<choice>>
state Begin <<fork>>
state Merge <<join>>
[*] --> Branch
Branch --> Begin: 需要协作
Branch --> Done: 直接完成
Begin --> A
Begin --> B
A --> Merge
B --> Merge
Merge --> Done
Done --> [*]`,
  notes: `stateDiagram-v2
state "审核材料" as Review
state "准备发布" as Publish
note left of Review : 完整保留左侧注释
note right of Publish
第一段注释

第二段完整说明
end note
Review --> Publish: 通过`,
  groupNote: `stateDiagram-v2
state "整体交付" as Delivery {
 state "内部检查" as Check
 note right of Check : 单项说明
 Check --> Complete
}
note left of Delivery : 复合状态说明
[*] --> Delivery
Delivery --> Done`,
  styles: `stateDiagram-v2
classDef important fill:#ffe4d1,stroke:#b06010,color:#283850,stroke-width:3px;
state "优先审阅" as Review
class Review important
style Done fill:#e6efff,stroke:#4c6ab7
Review --> Done`,
  rich: `stateDiagram-v2
state "**重点审核**与*辅助说明*" as Review
Review: **第一项**资料
Review: 第二项*反馈*
note right of Review : **完整注释**与*补充*
Review --> Done: **通过**或*反馈*`,
  literal: `stateDiagram-v2
state "字面原型 &lt;script&gt;literal&lt;/script&gt; &amp; 保留" as __proto__
state "字面结果" as constructor
__proto__ --> constructor: 原文保留
click __proto__ href "https://example.test/no-network"`,
  long: `stateDiagram-v2
state "完整标题${"W".repeat(160)}" as Review
Review: 完整说明${"审核材料".repeat(30)}
note right of Review : 完整注释${"W".repeat(240)}
Review --> Done: 完整关系${"W".repeat(160)}`,
  repeated: `stateDiagram-v2
A --> B: 第一条关系
A --> B: 第二条关系
B --> A: 返回
A --> A: 自连接`,
  nestedDirection: `stateDiagram-v2
direction LR
state "分层方向" as Outer {
 direction BT
 [*] --> A
 A --> B
}
Outer --> Done`,
  controlNote: `stateDiagram-v2
state Branch <<fork>>
note left of Branch : 分支说明
[*] --> Branch
Branch --> A
Branch --> B`,
  legacy: `stateDiagram
state "旧版状态" as Old
note right of Old : 旧版注释仍然保留
Old --> Done`,
  ...Object.fromEntries(["TB", "BT", "LR", "RL"].map((direction) => ["direction" + direction, `stateDiagram-v2
direction ${direction}
state "起始状态" as A
state "后续状态" as B
A --> B: 按方向流转`])),
};
