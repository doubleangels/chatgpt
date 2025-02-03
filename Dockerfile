FROM python:3.11-slim

# Set the working directory
WORKDIR /app

# Upgrade pip and install dependencies without cache
RUN pip install --upgrade pip && \
    pip install --no-cache-dir discord-py-interactions openai sentry-sdk bs4

# Copy the application code into the container
COPY main.py .

# Define the default command
CMD ["python", "-u", "main.py"]