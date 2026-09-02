$ErrorActionPreference = "Stop"

# ASCII cache path avoids the Chinese-username encoding issue in sentencepiece.
$env:MODELSCOPE_CACHE = "D:\funasr_cache"
$env:MODELSCOPE_HOME = "D:\funasr_cache"
$env:OMP_NUM_THREADS = "8"
$env:TORCH_NUM_THREADS = "8"

conda run -n funasr python "C:\Users\新凉\Desktop\3d弹幕墙\server\funasr\asr_server.py"
