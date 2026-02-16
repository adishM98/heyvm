package views

import "encoding/json"

func marshalJSON(v interface{}) ([]byte, error) {
	return json.Marshal(v)
}

func unmarshalJSON(b []byte, v interface{}) error {
	return json.Unmarshal(b, v)
}
