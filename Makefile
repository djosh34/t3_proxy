certs:
	mkdir -p certs
	openssl req -x509 -newkey rsa:2048 -nodes \
		-keyout certs/key.pem \
		-out certs/cert.pem \
		-days 365 \
		-subj "/CN=localhost" \
		-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
