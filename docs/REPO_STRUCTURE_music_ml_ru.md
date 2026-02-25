# Рекомендуемая структура репозитория
```
musicml/
  __init__.py
  utils.py
  features.py
  postprocess.py
  train.py
  infer.py
  models/
    __init__.py
    cnn_multitask.py
  datasets/
    __init__.py
    deam.py
    structure.py
configs/
  default.yaml
  thresholds.json
scripts/
  prepare_deam.py
  train.py
  infer.py
  eval.py
docs/
  REPORT_OUTLINE.md
results/
  metrics.csv
  figures/
```

## Форматы данных (минимум для старта)
### Структура (structure annotations)
`annotations.csv`:
- `audio_path,start,end,label`

или JSON:
```json
{
  "audio_path": "...",
  "segments": [{"start":0.0,"end":12.0,"label":"verse"}]
}
```

### Эмоции (DEAM‑like)
`deam.csv`:
- `audio_path,time_sec,arousal,valence`
