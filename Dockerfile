FROM node:23-bookworm AS frontend_node
ARG DOCKER_UID=1000
ARG DOCKER_GID=1000
ENV UID=${DOCKER_UID}
ENV GID=${DOCKER_GID}

RUN set -eux; \
    if getent passwd "${UID}"; then userdel -r "$(getent passwd "${UID}" | cut -d: -f1)"; fi; \
    if getent group "${GID}"; then groupdel -f "$(getent group "${GID}" | cut -d: -f1)"; fi; \
    groupadd --gid "$GID" builder || true; \
    adduser --uid "$UID" --gid "$GID" --disabled-password --gecos "" builder

USER ${UID}
