FROM denoland/deno:1.34.3

EXPOSE 3000

WORKDIR /app

USER deno

COPY types.ts main.ts /app/
RUN deno cache main.ts types.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-env", "main.ts"]
