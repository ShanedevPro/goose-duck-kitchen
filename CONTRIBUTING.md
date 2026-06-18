# 贡献指南

欢迎为鹅鸭小厨房提交改进。下面是参与开发的简单流程。

## 本地开发

```bash
npm install
npm run serve
```

然后打开 `http://127.0.0.1:4173/`。

## 提交前检查

在提交 PR 前，请先运行测试和语法检查：

```bash
npm run check
```

涉及移动端布局或视觉改动时，建议再跑一次视觉 QA：

```bash
QA_SCREENSHOT_MODE=abstract npm run qa:mobile
```

## 提交规范

- 一个 PR 只做一件事，描述清楚改动内容和原因。
- 保持改动最小化，遵循现有代码风格。
- 不要提交 `.env`、API key、token，以及 `node_modules/`、`.netlify/`、`assets/raw/`、`assets/concepts/` 等本地或工具目录（`.gitignore` 已覆盖）。

## 素材授权

代码、`assets/game/` 中的 PNG 素材和 `demo/` 演示视频均按 MIT License 授权。提交新素材即表示同意以相同授权分发。
