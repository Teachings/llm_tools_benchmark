# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose the application port
EXPOSE 8090

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8090", "--reload"]