@set TMP_MOUNT_ARGS=
@if not "%LATEXWORKSHOP_TMPDIR_HOST%"=="" if not "%LATEXWORKSHOP_TMPDIR_CONTAINER%"=="" set TMP_MOUNT_ARGS=-v "%LATEXWORKSHOP_TMPDIR_HOST%:%LATEXWORKSHOP_TMPDIR_CONTAINER%"
@%LATEXWORKSHOP_DOCKER_PATH% run -i --rm --pull=never --network=none --cap-drop=ALL --security-opt=no-new-privileges -w /data -v "%cd%:/data" %TMP_MOUNT_ARGS% %LATEXWORKSHOP_DOCKER_LATEX% latexindent %*
