# Base image
FROM ubuntu:24.04

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive

# Set default shell to bash (required for SDKMAN)
SHELL ["/bin/bash", "-c"]

# Update and install basic dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libcurl4 \
    wget \
    git \
    sudo \
    tree \
    ca-certificates \
    gnupg \
    build-essential \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (LTS version) via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

# Verify Node.js and npm installation
RUN node --version && npm --version && npx --version

# Set up SDKMAN environment (for developer user)
ENV SDKMAN_DIR="/home/developer/.sdkman"
ENV PATH="${SDKMAN_DIR}/bin:${PATH}"
ENV SDKMAN_QUIET=true

# Create non-root user (use UID 1001 to avoid conflicts)
RUN useradd -m -s /bin/bash -u 1001 developer

# Create workspace directory and set ownership
RUN mkdir -p /workspace && chown -R developer:developer /workspace

# Switch to developer user for SDKMAN installation
USER developer
WORKDIR /home/developer

# Install SDKMAN as developer user
RUN curl -s "https://get.sdkman.io" | bash

# Source SDKMAN and install SDKs as developer user
RUN bash -c "source ${SDKMAN_DIR}/bin/sdkman-init.sh && \
    sdk install java 25.0.1-graalce && \
    sdk install maven 3.9.10 && \
    sdk install gradle 9.2.1 && \
    sdk install jbang 0.135.0 && \
    sdk default java 25.0.1-graalce && \
    sdk default maven 3.9.10 && \
    sdk default gradle 9.2.1 && \
    sdk default jbang 0.135.0"

# Make SDKMAN available in shell sessions for developer user
RUN echo 'export SDKMAN_DIR="/home/developer/.sdkman"' >> /home/developer/.bashrc && \
    echo '[[ -s "${SDKMAN_DIR}/bin/sdkman-init.sh" ]] && source "${SDKMAN_DIR}/bin/sdkman-init.sh"' >> /home/developer/.bashrc

# Set JAVA_HOME environment variable
ENV JAVA_HOME="/home/developer/.sdkman/candidates/java/current"
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Make JAVA_HOME available in shell sessions for developer user
RUN echo 'export JAVA_HOME="/home/developer/.sdkman/candidates/java/current"' >> /home/developer/.bashrc && \
    echo 'export PATH="${JAVA_HOME}/bin:${PATH}"' >> /home/developer/.bashrc

# Set working directory
WORKDIR /workspace

# IMPORTANT: Do NOT install dependencies or build the project here!
# Cursor cloud agent will clone the code and handle builds/installs.
# This Dockerfile should ONLY set up the development environment.