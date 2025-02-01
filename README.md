# ChatGPT

![Logo](logo.png)

## Docker Compose
```
services:
  chatgpt:
     image: ghcr.io/doubleangels/chatgpt:latest
     container_name: chatgpt
     restart: always
     environment:
       - DISCORD_BOT_TOKEN=
       - OPENAI_API_KEY=

networks:
  default:
    name: chatgpt
```