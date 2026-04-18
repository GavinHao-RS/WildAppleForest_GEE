# 野苹果林遥感Trial-GEE分类单元说明

时间戳：2026-04-15 10:42:00 +08:00

本文说明主 notebook [wildapple_localrun_python.ipynb](d:/CODE/VS__Project/GEE/WildAppleForest_GEE/wildapple_localrun_python.ipynb) 中 `7. Trial GEE classification, map preview, and area accounting` 这一部分的设计意图、输入输出、算法逻辑，以及 2026-04-15 暴露出的内存限制问题与后续拆分方案。

## 1. 单元定位

这个单元的目标不是最终正式制图，而是一次 `trial run`。

它服务于四件事：
- 用当前筛选后的特征体系，在 GEE 端跑通一版整图分类。
- 生成原始分类图和简单平滑后的分类图。
- 对分类结果做面积试算。
- 通过地图预览观察 `class 1` 的空间扩张、假阳性热点和斑块格局。

它更接近：
- 空间诊断单元
- 面积试算单元

而不是：
- 最终成图单元
- 最终面积汇报单元

## 2. 为什么这一部分需要单独设计

前面的本地 `screened_model` 使用的是“最终筛选特征集”。  
但这个特征集并不一定全部都在 GEE 的 `FEATURE_IMAGE` 中天然存在。

例如这些特征本来就在 `FEATURE_IMAGE` 中：
- `NDVI_M08`
- `VH_db_std`
- `elevation`

但下面这些拟合特征来自本地时序拟合结果，不是 `FEATURE_IMAGE` 原生 band：
- `LSWI_a3`
- `EVI_a0`
- `NDVI_a1`
- `NDMI_r2`
- `NDVI_r2`
- `EVI_a2`
- `VV_VH_ratio_r2`

如果直接做：

```python
FEATURE_IMAGE.select(FINAL_SCREENED_FEATURES)
```

就会触发类似错误：

```text
Image.select: Band pattern 'LSWI_a3' did not match any bands
```

所以 Trial-GEE 分类部分的关键任务是：
- 从最终筛选特征集中识别哪些拟合特征被保留。
- 在 GEE 端按需补建这些拟合 band。
- 用补建后的影像重新采样训练样本，再做整图试分类。

## 3. 运行前必须存在的输入对象

前面单元必须已经成功构建以下对象：

- `MONTHLY_IMAGE`
  含义：按月拼接好的多源时序影像栈。
  用于在 GEE 端重建拟合特征。

- `FEATURE_IMAGE`
  含义：当前主流程的基础整合影像，包含：
  - 月尺度光学特征
  - 月尺度 SAR 特征
  - 物候统计特征
  - 地形特征
  - 纹理特征

- `SAMPLE_FC`
  含义：GEE 端样本集合，且保留几何。
  Trial 部分需要基于新影像重新采样，因此这里必须有几何。

- `CLEAN_DF`
  含义：样本清洗后的本地 DataFrame。
  用于决定哪些 `sample_id` 被保留进入 Trial 训练。

- `FINAL_SCREENED_FEATURES`
  含义：最终筛选后的特征集合。
  可能是 Python `list`，也可能是 DataFrame。

- `ROI`
  含义：研究区范围。

- `CLASS_INFO`
  含义：类别字典。

- `CONFIG`
  当前主要用到：
  - `random_seed`
  - `scale`
  - `start_month`

## 4. 当前这一部分的核心逻辑

### 4.1 将最终筛选特征拆成两类

当前代码首先会把 `FINAL_SCREENED_FEATURES` 兼容性读出，然后区分：
- 原生影像特征
- 拟合特征

拟合特征的识别规则是按命名后缀判断：
- `a3`
- `a2`
- `a1`
- `a0`
- `r2`

例如：
- `LSWI_a3`
- `NDVI_r2`

### 4.2 在 GEE 端按需补建拟合特征

当前代码不是把所有时序前缀都全量拟合，而是：
- 只识别当前最终筛选里真正需要哪些拟合特征
- 只对这些前缀做像元级三次拟合

例如如果最终特征里保留了：
- `LSWI_a3`
- `NDMI_r2`

那就只会在 GEE 端为：
- `LSWI`
- `NDMI`
构建拟合影像，并且只保留所需拟合项。

### 4.3 重新构建 Trial 训练样本

Trial 部分不会直接复用旧 `SAMPLE_FC` 里的 band 值作为训练表，而是：
- 先用 `CLEAN_DF` 中保留的 `sample_id` 子集筛出清洗后的样本点
- 再用包含拟合 band 的新影像重新 `sampleRegions()`

这样做的原因是：
- 新影像 `TRIAL_FEATURE_IMAGE` 中新增了拟合 band
- 旧 `SAMPLE_FC` 并没有这些 band
- 因此必须重新采样，保证训练样本与整图分类使用同一套特征空间

### 4.4 训练 GEE 随机森林并定义分类图

Trial 部分在 GEE 端训练：
- `TRIAL_CLASSIFIER`

然后定义：
- `TRIAL_CLASSIFIED_IMAGE`
- `TRIAL_SMOOTHED_IMAGE`

其中平滑图当前只做了：
- `focal_mode(radius=1, units="pixels")`

这属于试运行级别的轻度平滑，不代表最终后处理方案。

## 5. 当前运行时暴露出的内存限制问题

### 5.1 触发位置

当前最新暴露的问题不是分类器训练失败，而是面积统计失败。

失败位置在类似下面这两句：

```python
TRIAL_AREA_RAW_DF = geemap.ee_to_df(calculate_area_by_class(TRIAL_CLASSIFIED_IMAGE, ROI, CLASS_INFO))
TRIAL_AREA_SMOOTHED_DF = geemap.ee_to_df(calculate_area_by_class(TRIAL_SMOOTHED_IMAGE, ROI, CLASS_INFO))
```

GEE 返回的错误是：

```text
User memory limit exceeded.
```

### 5.2 这不是什么问题

这不是：
- 网络问题
- token 问题
- `geemap.ee_to_df()` 的本地传输问题

### 5.3 这是什么问题

这是真正的 GEE 服务端内存限制问题。

根因在于你当前面积统计请求会迫使 GEE 对整幅 ROI 真正执行整条计算链：
- 拟合特征重建
- 整图分类
- 平滑
- 全区面积归并

### 5.4 为什么分类图能定义，但面积统计会炸

因为 GEE 是惰性执行。

这句：

```python
TRIAL_CLASSIFIED_IMAGE = TRIAL_FEATURE_IMAGE.select(TRIAL_FEATURE_LIST).classify(TRIAL_CLASSIFIER)
```

通常只是定义了一张分类图表达式，不代表整个 ROI 已经完整算完并落盘。

真正触发大规模计算的是后面的操作，例如：
- `getInfo()`
- `reduceRegion()`
- `ee_to_df()`
- 导出

所以当前更准确的理解是：
- 分类图对象已经定义成功
- 面积统计第一次要求 GEE 对整个 ROI 真正执行整条计算图
- 因此在面积统计阶段触发了内存超限

### 5.5 当前阶段的结论

当前可以认为：
- 分类器训练这一步已经过了
- `TRIAL_CLASSIFIED_IMAGE` 和 `TRIAL_SMOOTHED_IMAGE` 对象应已定义成功
- 当前阻塞点主要是全区面积统计，不是分类器本身

## 6. 为什么要把这一部分拆成 3 个 cell

基于上述内存限制问题，当前不应把：
- 训练样本构建
- 分类器训练
- 整图分类
- 地图预览
- 面积统计

全部塞在一个 cell 里。

因为这样会导致：
- 面积统计一旦失败，前面已成功的分类和地图步骤也被整格打断
- 问题定位不清晰

所以当前更合理的结构是拆成 3 格。

## 7. 推荐的 3 格拆分方案

### 7A. Trial feature assembly and classifier training

这一格只负责：
- 解析 `FINAL_SCREENED_FEATURES`
- 识别需要补建的拟合特征
- 构建 `TRIAL_CUBIC_IMAGE`
- 构建 `TRIAL_FEATURE_IMAGE`
- 用清洗后的样本点重新采样，得到 `TRIAL_TRAINING_FC`
- 训练 `TRIAL_CLASSIFIER`

这一格的主要输出对象：
- `TRIAL_CUBIC_IMAGE`
- `TRIAL_FEATURE_IMAGE`
- `TRIAL_FEATURE_LIST`
- `TRIAL_TRAINING_FC`
- `TRIAL_CLASSIFIER`

建议打印：
- `Trial candidate feature count`
- `Trial image-backed feature count`
- `Trial excluded non-image features`
- `Excluded feature examples`
- `Trial training sample count`

这一格的作用是先确认：
- 拟合特征补建没有问题
- 训练样本重采样没有问题
- 分类器训练没有问题

### 7B. Trial image classification and map preview

这一格只负责：
- 用 `TRIAL_CLASSIFIER` 生成：
  - `TRIAL_CLASSIFIED_IMAGE`
  - `TRIAL_SMOOTHED_IMAGE`
- 构建 `folium` 地图预览

这一格的主要输出对象：
- `TRIAL_CLASSIFIED_IMAGE`
- `TRIAL_SMOOTHED_IMAGE`
- `trial_map`

建议打印：
- `Trial classified image ready.`
- `Trial smoothed image ready.`

这一格的作用是：
- 先看图
- 观察 `class 1` 的空间扩张位置
- 让空间检查独立于面积统计

### 7C. Trial area accounting

这一格只负责：
- 对 `TRIAL_CLASSIFIED_IMAGE` 做面积统计
- 对 `TRIAL_SMOOTHED_IMAGE` 做面积统计
- 增加 `area_ha`
- 写出 csv
- 显示面积表

推荐写法是：

```python
# Area accounting is isolated from trial classification so map preview can run even if ROI-wide aggregation is heavy.

TRIAL_AREA_RAW_DF = geemap.ee_to_df(
    calculate_area_by_class(TRIAL_CLASSIFIED_IMAGE, ROI, CLASS_INFO)
)
TRIAL_AREA_SMOOTHED_DF = geemap.ee_to_df(
    calculate_area_by_class(TRIAL_SMOOTHED_IMAGE, ROI, CLASS_INFO)
)

TRIAL_AREA_RAW_DF["area_ha"] = TRIAL_AREA_RAW_DF["area_m2"] / 10000
TRIAL_AREA_SMOOTHED_DF["area_ha"] = TRIAL_AREA_SMOOTHED_DF["area_m2"] / 10000

TRIAL_AREA_RAW_DF.to_csv(OUTPUT_DIR / "trial_area_by_class_raw.csv", index=False)
TRIAL_AREA_SMOOTHED_DF.to_csv(OUTPUT_DIR / "trial_area_by_class_smoothed.csv", index=False)

print("Trial raw area summary (ha):")
display(TRIAL_AREA_RAW_DF)
print("Trial smoothed area summary (ha):")
display(TRIAL_AREA_SMOOTHED_DF)
```

这一格当前仍可能继续触发：
- `User memory limit exceeded`

但拆开之后的价值是：
- 你可以先看到分类图和地图
- 不必让面积统计失败拖垮前面已经成功的步骤

## 8. 为什么 7C 的 scale 继续用 20 m

当前 `calculate_area_by_class()` 内部用的是：

```python
scale=CONFIG["scale"]
```

而当前主流程配置就是：
- `CONFIG["scale"] = 20`

所以 7C 当前应继续使用 `20 m`，理由是：
- 与前面的样本抽样尺度一致
- 与当前主流程特征处理口径一致
- 比 `10 m` 更省算力
- 比 `30 m` 更能保留边界和小斑块

因此当前 Trial 面积统计的标准口径应当是：
- `20 m`

不建议现在为了躲避内存限制，随意把 7C 改成更粗尺度来“强行跑通”，因为这样会让面积解释口径发生变化。

## 9. 如果 7C 继续报内存限制，下一步应怎么做

当前推荐顺序是：

1. 先把 Trial-GEE 分类部分拆成 `7A/7B/7C`
2. 先运行 `7A` 和 `7B`，确认：
   - 分类器训练成功
   - 分类图和平滑图能显示
3. 再单独运行 `7C`

如果 `7C` 仍然报：
- `User memory limit exceeded`

更稳的下一步不是继续硬改 7C，而是：
- 先把 `TRIAL_CLASSIFIED_IMAGE` 或 `TRIAL_SMOOTHED_IMAGE` 导出到 GEE asset
- 再基于导出的栅格结果做面积统计

这样做的好处是：
- 将“分类图计算”与“面积统计”解耦
- 避免每次面积统计都重新触发整条重计算链

## 10. 这一部分当前的正确理解

当前 Trial-GEE 分类部分应理解为：

- 本地 `screened_model` 的 GEE 端近似重建版本
- 它尽量补回本地最终筛选中有价值的拟合特征
- 但它仍然首先服务于：
  - 看图
  - 看空间假阳性
  - 看面积试算是否明显偏大

而不是直接作为最终正式制图与最终面积结果。

## 11. 一句话总结

当前 `Trial GEE classification` 部分的本质是：

- 用最终筛选结果中的 GEE 可复现特征和按需补建的拟合特征
- 在 GEE 端跑一版更接近本地最终模型的整图试分类
- 先完成分类和地图预览
- 再将全区面积统计单独拆开处理

拆成 `7A/7B/7C` 是当前最合理、最稳妥的工程结构。
