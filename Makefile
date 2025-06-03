# Makefile for the Alertmanager Silence Manager

.PHONY: build run clean docker-build docker-run

# Default Go build flags
GOFLAGS := -trimpath -ldflags "-w -s \
 -X main.Branch=$(shell git rev-parse --abbrev-ref HEAD)\
 -X main.Revision=$(shell git rev-list -1 HEAD)\
 -X main.Version=$(shell git tag --points-at HEAD)"

# Build settings
BINARY := asanager
VERSION := 0.1.0

# Docker settings
DOCKER_IMAGE := asanager
DOCKER_TAG := latest

# Default build target
build:
	@echo "Building $(BINARY) v$(VERSION)..."
	go build $(GOFLAGS) -o $(BINARY)

# Run the application
run:
	@echo "Running $(BINARY)..."
	go run main.go

# Clean build artifacts
clean:
	@echo "Cleaning up..."
	rm -f $(BINARY)

# Build Docker image
docker-build:
	@echo "Building Docker image $(DOCKER_IMAGE):$(DOCKER_TAG)..."
	docker build -t $(DOCKER_IMAGE):$(DOCKER_TAG) .

# Run Docker container
docker-run:
	@echo "Running Docker container..."
	docker run -p 9193:9193 --rm $(DOCKER_IMAGE):$(DOCKER_TAG)

# Build for multiple platforms
build-all: build-linux build-darwin build-windows

build-linux:
	@echo "Building for Linux..."
	GOOS=linux GOARCH=amd64 go build $(GOFLAGS) -o $(BINARY)-linux-amd64

build-darwin:
	@echo "Building for macOS..."
	GOOS=darwin GOARCH=amd64 go build $(GOFLAGS) -o $(BINARY)-darwin-amd64

build-windows:
	@echo "Building for Windows..."
	GOOS=windows GOARCH=amd64 go build $(GOFLAGS) -o $(BINARY)-windows-amd64.exe
