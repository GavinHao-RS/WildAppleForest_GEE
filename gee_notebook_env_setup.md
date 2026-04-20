# GEE Notebook 环境配置方案

适用对象：

- Windows
- PowerShell
- 已有 `conda` 环境：`gee`
- 当前解释器：`D:\CODE\environments\anaconda3\envs\gee\python.exe`
- 当前 Python 版本：`3.11.15`

目标 notebook：

- `D:\CODE\VS__Project\GEE\PyGee_作物分类纯py版本_教学注释版.ipynb`

## 1. 我检查到的 notebook 依赖

这个 notebook 里实际用到了这些库：

- `earthengine-api` (`import ee`)
- `geemap`
- `pandas`
- `numpy`
- `scipy`
- `scikit-learn`
- `matplotlib`
- `seaborn`
- `rasterio`
- `shap`
- `ipykernel`
- `notebook` / `jupyterlab`

其中你当前 `gee` 环境里已经有：

- `ee`
- `geemap`
- `pandas`
- `numpy`
- `matplotlib`
- `ipykernel`
- `notebook`
- `jupyterlab`

还缺：

- `scipy`
- `scikit-learn`
- `seaborn`
- `rasterio`
- `shap`

## 2. 这台电脑的额外注意事项

你的电脑上 `conda env list` 会触发插件报错，所以建议后续用下面两种方式之一：

### 方案 A：每次先关闭 conda 插件

```powershell
$env:CONDA_NO_PLUGINS='true'
```

### 方案 B：命令里直接加 `--no-plugins`

```powershell
conda --no-plugins run -n gee python --version
```

推荐优先用方案 A。

## 3. 推荐安装命令

先在 PowerShell 里执行：

```powershell
$env:CONDA_NO_PLUGINS='true'
```

再安装缺失依赖：

```powershell
conda install -n gee -c conda-forge scipy scikit-learn seaborn rasterio shap -y
```

如果你想顺手把 GEE 相关包也更新到较新版本，可以再执行：

```powershell
conda run -n gee python -m pip install -U earthengine-api geemap
```

## 4. 注册 Jupyter 内核

虽然你已经装了 `ipykernel`，但为了让 VS Code / Jupyter 能明确选中这个环境，建议注册一次：

```powershell
conda run -n gee python -m ipykernel install --user --name gee --display-name "Python (gee)"
```

## 5. Earth Engine 首次认证

这个 notebook 里直接写了：

```python
ee.Initialize(project="kindle-400911")
```

所以你必须先完成 Earth Engine 登录认证。终端执行：

```powershell
conda run -n gee earthengine authenticate
```

如果上面命令找不到，也可以用：

```powershell
conda run -n gee python -c "import ee; ee.Authenticate()"
```

## 6. 必须手动检查的两处 notebook 内容

### 6.1 GEE project

`project="kindle-400911"` 很可能是原作者自己的项目 ID。

你需要改成你自己的 GEE Cloud Project，例如：

```python
ee.Initialize(project="你的-project-id")
```

### 6.2 GEE Asset 路径

notebook 里还有：

```python
roi = ee.FeatureCollection("projects/ee-erhbuijnfgqthjngsrjyn/assets/bqx")
```

这也是一个具体资产路径。如果这个资产不在你的账号下，或者你没有访问权限，代码会直接报错。

你需要：

- 要么确认你有这个 asset 的访问权限
- 要么把它替换成你自己账号下的 asset 路径

## 7. 推荐启动方式

### 用 JupyterLab

```powershell
conda run -n gee jupyter lab
```

然后打开：

- `D:\CODE\VS__Project\GEE\PyGee_作物分类纯py版本_教学注释版.ipynb`

并在右上角内核里选择：

- `Python (gee)`

### 用 VS Code

1. 打开这个 notebook
2. 右上角选择内核
3. 选 `D:\CODE\environments\anaconda3\envs\gee\python.exe` 或 `Python (gee)`

## 8. 安装完成后的自检命令

你可以用这条命令快速检查环境是否齐全：

```powershell
conda run --no-capture-output -n gee python -c "mods=['ee','geemap','pandas','numpy','scipy','sklearn','matplotlib','seaborn','rasterio','shap']; import importlib.util; [print(('OK ' if importlib.util.find_spec(m) else 'MISS ')+m) for m in mods]"
```

理想输出应该全部是 `OK`。

## 9. 最稳妥的执行顺序

```powershell
$env:CONDA_NO_PLUGINS='true'
conda install -n gee -c conda-forge scipy scikit-learn seaborn rasterio shap -y
conda run -n gee python -m pip install -U earthengine-api geemap
conda run -n gee python -m ipykernel install --user --name gee --display-name "Python (gee)"
conda run -n gee earthengine authenticate
conda run -n gee jupyter lab
```

## 10. 如果后面仍然报错

优先排查这三类问题：

1. 包没装全，尤其是 `rasterio`、`shap`
2. `ee.Initialize()` 里的 `project` 不是你自己的
3. `FeatureCollection` 里的 asset 路径你没有权限

如果你希望，我下一步可以继续帮你做两件事之一：

- 直接给你一份“可复制执行”的 PowerShell 一键安装脚本
- 继续检查这个 notebook，帮你把需要替换的 `project` 和 `asset` 位置全部找出来
