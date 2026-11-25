export const sequenceSamples = {
  basic: `sequenceDiagram
accTitle: 本地工作区保存
accDescr: 按消息顺序检查保存与返回，保留完整说明。
actor User as 使用者
participant App as 任务面板
participant Store as 本地存储
User->>App: 编辑任务
App->>Store: 保存整个工作区
Store-->>App: 保存成功
App-->>User: 可以继续操作`,
  boxes: `sequenceDiagram
box rgb(230, 240, 255) 工作区
participant App as 任务面板
participant Store as 本地存储
end
box transparent 外部入口
actor User as 使用者
end
User->>App: 修改标题
App->>Store: 保存
Note over App,Store: 完整保留分组说明`,
  uncolored: `sequenceDiagram
box 工作区
participant A
participant B
end
A->>B: 无颜色的中文分组名
box Yellow 归档区
participant C
end
B->>C: 保留命名颜色`,
  lifecycle: `sequenceDiagram
participant App as 任务面板
App->>App: 读取输入
create participant Draft as 新建对象
App->>Draft: 创建草稿
Draft-->>App: 返回草稿
create actor Person as 新参与者
App->>Person: 邀请参与
destroy Draft
App-xDraft: 销毁草稿
destroy Person
Person-->>App: 已离开
App->>App: 继续处理`,
  activations: `sequenceDiagram
participant A as 任务面板
participant B as 保存队列
activate A
A->>+B: 首次保存
A->>+B: 再次进入
B->>B: 队列内自调用
B-->>-A: 第二次返回
B-->>-A: 首次返回
deactivate A`,
  blocks: `sequenceDiagram
participant A
participant B
loop 每次编辑
  A->>B: 请求保存
  alt 校验通过
    opt 有新附件
      B->>B: 保存附件
    end
    B-->>A: 保存成功
  else 数据待修正
    B-->>A: 保留草稿
  end
end`,
  parallel: `sequenceDiagram
participant A
participant B
participant C
par 更新任务
  A->>B: 写入任务
and 更新习惯
  A->>C: 写入习惯
end
par_over 汇总结果
  B-->>A: 任务已保存
and 习惯结果
  C-->>A: 习惯已保存
end`,
  critical: `sequenceDiagram
participant A
participant B
critical 原子保存
  A->>B: 提交事务
option 空间不足
  B-->>A: 保留旧数据
option 写入失败
  B-->>A: 原地重试
end
break 用户取消
  A->>A: 返回编辑
end`,
  highlights: `sequenceDiagram
participant A
participant B
rect rgb(220, 240, 255)
A->>B: 浅蓝色高亮
rect rgba(255, 220, 180, 0.5)
B-->>A: 嵌套高亮
end
end`,
  notes: `sequenceDiagram
participant A as 任务面板
participant B as 工作区
Note left of A: 左侧完整说明<br/>第二行
A->>B: 消息第一行<br>消息第二行
Note right of B: 右侧长说明需要完整显示，不覆盖生命线或其他注释文字
Note over A,B: 跨两位参与者的共同说明
Note over A: 单人说明`,
  numbering: `sequenceDiagram
autonumber 1.25 0.25
A->>B: 第一条
B-->>A: 第二条
autonumber off
A->>B: 隐藏编号
autonumber
B-->>A: 恢复编号
autonumber 10 2
A->>B: 重新开始
B-->>A: 指定步长`,
  types: `sequenceDiagram
actor A as 人员
participant B@{ "type": "boundary", "alias": "边界" }
participant C@{ "type": "control", "alias": "控制器" }
participant D@{ "type": "entity", "alias": "实体" }
participant E@{ "type": "database", "alias": "数据库" }
participant F@{ "type": "collections", "alias": "集合" }
participant G@{ "type": "queue", "alias": "消息队列" }
participant H as 普通参与者
A->>B: 输入
B->>C: 控制
C->>D: 实体处理
D->>E: 保存
E->>F: 集合读取
F->>G: 入队
G->>H: 交付`,
  arrows: `sequenceDiagram
A->B: 实线无箭头
B-->A: 虚线无箭头
A->>B: 实心箭头
B-->>A: 虚线实心箭头
A-xB: 实线叉号
B--xA: 虚线叉号
A-)B: 异步开放箭头
B--)A: 虚线异步箭头
A<<->>B: 双向实线
B<<-->>A: 双向虚线`,
  halves: String.raw`sequenceDiagram
A-|\B: 上半实心
B-|/A: 下半实心
A--|\B: 上半虚线
B--|/A: 下半虚线
A-\\B: 上半开放
B-//A: 下半开放
A--\\B: 上半开放虚线
B--//A: 下半开放虚线
A/|-B: 反向上半实心
B\|-A: 反向下半实心
B\\-A: 反向下半开放
A//-B: 反向上半开放
B/|--A: 反向上半虚线
A\|--B: 反向下半虚线
B//--A: 反向上半开放虚线
A\\--B: 反向下半开放虚线`,
  central: `sequenceDiagram
participant A
participant B
A->>()B: 连接目标中心
A()->>B: 连接来源中心
B()->>()A: 连接两端中心`,
  literal: `sequenceDiagram
participant __proto__ as 原型名称
participant constructor as 构造名称
__proto__->>constructor: Store#lt;T#gt; #38; #9829; #59;
Note over __proto__,constructor: 保留 #lt;literal#gt; 字面文字
link __proto__: 外部说明 @ https://example.invalid/docs
links constructor: {"危险链接":"javascript:alert(1)","正常链接":"https://example.invalid/help"}
properties constructor: {"负责人":"研发组","数量":0,"启用":false}
details constructor: 外部资料节点`,
  long: `sequenceDiagram
box rgb(220, 235, 250) 很长的参与者分组标题需要完整保留并且能够在原尺寸查看
participant A as 负责整理任务与准备周会的移动应用入口
participant B as 负责持久保存工作区与处理失败重试的本地服务
end
A->>B: 本次保存包含任务、子任务、检查项、清单与习惯等全部内容，需要完整保留这段长消息
Note left of A: 长注释应换行显示并为完整文字预留空间，避免覆盖参与者名称和消息
loop 持续检查每一个需要核对的工作区与当前任务
B-->>A: 保存结果会保留全部说明和原始语法，失败时仍可以继续查看其他图表
end`,
  empty: `sequenceDiagram
box 未开始的工作区
participant A as 等待输入
participant B as 等待保存
end`,
  denseBoxes: `sequenceDiagram
box 第一组的长标题需要完整显示并且不会覆盖紧邻的其他分组
participant A as 入口
end
box rgba(220, 240, 250, 0.5) 第二组的长标题同样需要留出足够的水平空间与垂直空间
participant B as 保存
end
box 尚未分配参与者的空组
end
A->>B: 检查分组排版`,
};
