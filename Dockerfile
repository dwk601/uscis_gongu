FROM node:24.16.0 AS web
WORKDIR /src/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM golang:1.27.3 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=web /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -o /server .

FROM alpine:3.23
RUN addgroup -S app && adduser -S -G app app && \
    mkdir -p /app/pb_data && chown app:app /app/pb_data
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /server /app/server
USER app
WORKDIR /app
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1
CMD ["/app/server", "serve", "--http=0.0.0.0:8090", "--dir=/app/pb_data", "--encryptionEnv=PB_ENCRYPTION_KEY"]
