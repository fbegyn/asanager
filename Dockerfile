FROM golang:1.19-alpine AS builder

# Set working directory
WORKDIR /app

# Copy go.mod and go.sum
COPY go.mod ./

# Copy the source code
COPY *.go ./
COPY index.html ./
COPY script.js ./
COPY styles.css ./
COPY favicon.ico ./

# Build the application
RUN go build -ldflags "-w -s \
    -X main.Branch=$(shell git rev-parse --abbrev-ref HEAD)\
    -X main.Revision=$(shell git rev-list -1 HEAD) \
    -X main.Version=$(shell git tag --points-at HEAD)" \
    -o asanager

# Use a smaller base image for the final image
FROM alpine:latest

# Set working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/asanager /app/asanager

# Expose port
EXPOSE 9193

# Set environment variables with defaults (can be overridden when running the container)
ENV PORT=9193
ENV PROMETHEUS_URL=http://prometheus.foo.bar
ENV ALERTMANAGER_URL=http://alertmanager.foo.bar

# Run the binary
CMD ["/app/asanager"]
