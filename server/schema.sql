IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Orgs')
CREATE TABLE Orgs (
    id NVARCHAR(50) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    sub_tier NVARCHAR(50) DEFAULT 'free',
    max_rows INT DEFAULT 10000
);

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
CREATE TABLE Users (
    id NVARCHAR(50) PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    org_id NVARCHAR(50) NOT NULL,
    role NVARCHAR(50) DEFAULT 'member',
    FOREIGN KEY (org_id) REFERENCES Orgs(id)
);

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sessions')
CREATE TABLE Sessions (
    id NVARCHAR(50) PRIMARY KEY, -- Token
    user_id NVARCHAR(50) NOT NULL,
    org_id NVARCHAR(50) NOT NULL,
    exp BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    FOREIGN KEY (org_id) REFERENCES Orgs(id)
);

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Models')
CREATE TABLE Models (
    id NVARCHAR(50) PRIMARY KEY,
    org_id NVARCHAR(50) NOT NULL,
    name NVARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL,
    target_variable NVARCHAR(255),
    features NVARCHAR(MAX), -- JSON string
    performance NVARCHAR(MAX), -- JSON string
    encoding_map NVARCHAR(MAX), -- JSON string
    feature_importance NVARCHAR(MAX), -- JSON string
    model_json NVARCHAR(MAX), -- Large JSON string
    algorithm NVARCHAR(50) DEFAULT 'random_forest',
    FOREIGN KEY (org_id) REFERENCES Orgs(id)
);
