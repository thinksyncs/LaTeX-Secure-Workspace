@%LATEXWORKSHOP_DOCKER_PATH% run -i --rm --pull=never --network=none --cap-drop=ALL --security-opt=no-new-privileges -w /data -v "%cd%:/data:ro" %LATEXWORKSHOP_DOCKER_LATEX% texcount %*
