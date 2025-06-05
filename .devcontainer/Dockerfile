# .devcontainer/Dockerfile
FROM mcr.microsoft.com/devcontainers/typescript-node:0-18

ARG CMAKE_VER=4.0.2

RUN apt-get update \
  && apt-get -y install build-essential \
  && apt-get install -y wget \
  && rm -rf /var/lib/apt/lists/* \
  && wget https://github.com/Kitware/CMake/releases/download/v${CMAKE_VER}/cmake-${CMAKE_VER}-Linux-x86_64.sh \
      -q -O /tmp/cmake-install.sh \
      && chmod u+x /tmp/cmake-install.sh \
      && mkdir /opt/cmake-${CMAKE_VER} \
      && /tmp/cmake-install.sh --skip-license --prefix=/opt/cmake-${CMAKE_VER} \
      && rm /tmp/cmake-install.sh \
      && ln -s /opt/cmake-${CMAKE_VER}/bin/* /usr/local/bin

# Install vsce globally for packaging VS Code extensions
RUN npm install -g vsce

WORKDIR /workspace