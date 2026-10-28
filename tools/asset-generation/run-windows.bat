@echo off
REM ============================================================================
REM  AI Bot City Simulator V4 — Windows GPU launcher (single command)
REM
REM  Run from the repo root on Windows (Command Prompt or PowerShell):
REM      tools\asset-generation\run-windows.bat
REM
REM  What it does, in order (each step fails with a clear message, not a
REM  traceback dump, if its check fails):
REM    1. Checks Python 3.10+ is installed
REM    2. Creates (if missing) and activates .venv-v4, installs requirements
REM    3. Checks nvidia-smi exists and reports driver + GPU name
REM    4. Checks CUDA-enabled PyTorch (torch.cuda.is_available())
REM    5. Checks VRAM >= 5.5 GB usable (RTX 4050 has 6 GB)
REM    6. Checks free disk space >= 15 GB (weights ~4.3 GB + outputs)
REM    7. Sets HF_HOME to tools\asset-generation\models\ unless already set
REM    8. Runs generate.py (resumable, batch 1, 512x512, fp16)
REM    9. Runs validate_assets.py
REM   10. Prints the next step: visual check, then integrate.py
REM
REM  It does NOT generate anything on a machine without a CUDA GPU, and it
REM  does NOT deploy anything. After integration + tests pass, commit/push/
REM  deploy are separate, manual steps (see RUN_ON_WINDOWS_GPU.md).
REM  Requires no Muse, no VM, and no manual Python steps beyond running it.
REM ============================================================================
setlocal EnableDelayedExpansion
REM Repo root = two levels up from this script's directory.
pushd "%~dp0..\.." || (
  echo [FAIL] Could not find the repo root from this script's location.
  echo        Run it as: tools\asset-generation\run-windows.bat
  exit /b 1
)
set "REPO=%CD%"
set "TOOLS=%REPO%\tools\asset-generation"
echo [1/10] Checking Python 3.10+ ...
python --version >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Python was not found on PATH.
  echo        Install Python 3.10 or newer from python.org, tick
  echo        "Add python.exe to PATH" during install, then re-run this file.
  popd & exit /b 1
)
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Python 3.10+ is required. Your version:
  python --version
  echo        Install Python 3.10 or newer, then re-run this file.
  popd & exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo        Found: %%v

echo [2/10] Creating / activating virtual environment (.venv-v4) ...
if not exist "%REPO%\.venv-v4\Scripts\activate.bat" (
  python -m venv "%REPO%\.venv-v4" || (
    echo [FAIL] Could not create the virtual environment.
    echo        Check disk space and Python permissions, then re-run.
    popd & exit /b 1
  )
)
call "%REPO%\.venv-v4\Scripts\activate.bat" || (
  echo [FAIL] Could not activate .venv-v4. Delete .venv-v4 and re-run.
  popd & exit /b 1
)
python -m pip install --upgrade pip >nul 2>&1
python -m pip install -r "%TOOLS%\requirements.txt" || (
  echo [FAIL] pip install failed. Check your internet connection, then re-run.
  echo        (This step is resumable: already-installed packages are skipped.)
  popd & exit /b 1
)
echo        Requirements installed.

echo [3/10] Checking NVIDIA driver (nvidia-smi) ...
nvidia-smi >nul 2>&1
if errorlevel 1 (
  echo [FAIL] nvidia-smi was not found. No NVIDIA GPU/driver detected.
  echo        Install the latest NVIDIA driver for your RTX 4050 from
  echo        nvidia.com/drivers, restart, then re-run this file.
  echo        This launcher will NOT run generation on CPU.
  popd & exit /b 1
)
for /f "tokens=*" %%l in ('nvidia-smi --query-gpu^=name,driver_version --format^=csv,noheader 2^>nul') do echo        GPU: %%l

echo [4/10] Checking CUDA-enabled PyTorch ...
python -c "import torch; print(torch.__version__)" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] PyTorch is not installed correctly in .venv-v4.
  echo        Delete .venv-v4 and re-run (step 2 reinstalls it), or check
  echo        RUN_ON_WINDOWS_GPU.md for the manual torch cu121 install.
  popd & exit /b 1
)
python -c "import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] PyTorch reports CUDA as NOT available.
  echo        Fix the NVIDIA driver / CUDA install first (torch must be the
  echo        cu121 build, not the CPU build), then re-run. Do NOT proceed
  echo        on CPU: generation would take hours and may run out of memory.
  popd & exit /b 1
)
echo        CUDA is available.

echo [5/10] Checking VRAM (need at least 5.5 GB usable) ...
python -c "import torch,sys; sys.exit(0 if torch.cuda.get_device_properties(0).total >= 5.5*1024**3 else 1)" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Less than 5.5 GB VRAM detected.
  echo        This pipeline targets a 6 GB card (RTX 4050). Close GPU-using
  echo        apps, or enable sequential CPU offload in model-config.json
  echo        (much slower), then re-run.
  popd & exit /b 1
)
for /f "tokens=*" %%l in ('python -c "import torch; print(f\"{torch.cuda.get_device_properties(0).total/1024**3:.1f} GB\")" 2^>nul') do echo        VRAM: %%l

echo [6/10] Checking free disk space (need at least 15 GB) ...
python -c "import shutil,sys; sys.exit(0 if shutil.disk_usage(r'%REPO%').free >= 15*1024**3 else 1)" >nul 2>&1
if errorlevel 1 (
  echo [FAIL] Less than 15 GB free disk space.
  echo        Weights are ~4.3 GB plus outputs. Free disk space, then re-run.
  popd & exit /b 1
)
echo        Disk space OK.

echo [7/10] Setting model cache (HF_HOME) ...
if not defined HF_HOME (
  set "HF_HOME=%TOOLS%\models"
  echo        HF_HOME=%HF_HOME%  (weights cached here, gitignored, never in public/)
) else (
  echo        Using existing HF_HOME=%HF_HOME%
)

echo [8/10] Generating assets (resumable: already-generated assets are skipped) ...
cd /d "%TOOLS%"
python generate.py || (
  echo [FAIL] generate.py failed. See the message above.
  echo        Re-running this file resumes from already-generated assets.
  popd & exit /b 1
)

echo [9/10] Validating generated assets ...
python validate_assets.py || (
  echo [FAIL] validate_assets.py failed. Inspect outputs\validation-report.json
  echo        and outputs\contact-sheet.png, reject bad assets, then re-run.
  popd & exit /b 1
)

echo [10/10] Done — generation + validation passed.
echo.
echo NEXT STEP (do not skip the visual check):
echo   1. Open outputs\contact-sheet.png and inspect every asset.
echo   2. For each asset you approve, copy its PNG + JSON from
echo      outputs\raw\ into outputs\approved\.
echo   3. Run:  python integrate.py
echo      (copies ONLY approved, re-validated assets to public\v4-assets\,
echo       writes public\v4-assets\manifest.json, and prints the Phaser
echo       preload wiring to add by hand.)
echo   4. Then: npm run build ^&^& npm test ^&^& npm run test:e2e, screenshot
echo      default / close / follow / narrow views, commit, push, deploy.
echo See RUN_ON_WINDOWS_GPU.md for full details.
popd
exit /b 0
