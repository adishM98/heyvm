package config

import (
	"os"
	"path/filepath"
)

const (
	// ConfigDirName is the name of the config directory
	ConfigDirName = ".heyvm"

	// ConfigFileName is the name of the main config file
	ConfigFileName = "config.yaml"

	// StateFileName is the name of the state file
	StateFileName = "state.json"

	// LogsDirName is the name of the logs directory
	LogsDirName = "logs"

	// LogFileName is the name of the log file
	LogFileName = "heyvm-core.log"
)

// GetConfigDir returns the path to the config directory
func GetConfigDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ConfigDirName), nil
}

// GetConfigPath returns the path to the config file
func GetConfigPath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, ConfigFileName), nil
}

// GetStatePath returns the path to the state file
func GetStatePath() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, StateFileName), nil
}

// GetLogsDir returns the path to the logs directory
func GetLogsDir() (string, error) {
	configDir, err := GetConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, LogsDirName), nil
}

// GetLogPath returns the path to the log file
func GetLogPath() (string, error) {
	logsDir, err := GetLogsDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(logsDir, LogFileName), nil
}

// EnsureConfigDir creates the config directory if it doesn't exist
func EnsureConfigDir() error {
	configDir, err := GetConfigDir()
	if err != nil {
		return err
	}

	// Create config directory with secure permissions (0700)
	if err := os.MkdirAll(configDir, 0700); err != nil {
		return err
	}

	// Create logs directory
	logsDir, err := GetLogsDir()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(logsDir, 0700); err != nil {
		return err
	}

	return nil
}

// ConfigExists checks if the config file exists
func ConfigExists() (bool, error) {
	configPath, err := GetConfigPath()
	if err != nil {
		return false, err
	}

	_, err = os.Stat(configPath)
	if os.IsNotExist(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	return true, nil
}
