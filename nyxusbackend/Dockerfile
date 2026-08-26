FROM node:22

RUN echo "nameserver 8.8.8.8" > /etc/resolv.conf

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

CMD ["bash"]