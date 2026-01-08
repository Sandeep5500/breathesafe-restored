import React from "react";
import "./App.css";
import { Grommet, Box, Text, Menu } from "grommet";
import { MapLocation } from "grommet-icons";

class App extends React.Component {
  constructor() {
    super();
    this.state = {
      latitude: -1,
      longitude: -1,
      customSelected: false,
      predictedPPM: null,
      showPredictionAlert: false,
      historicalData: []
    };
  }
  decideColor(value) {
    const ppm = value || this.state.currentReading;
    if (ppm <= 1000) {
      return "status-ok";
    } else if (ppm <= 2000) {
      return "status-warning";
    } else if (ppm > 3000) {
      return "status-critical";
    }
  }
  getSensorReading(index) {
    fetch(
      "https://api.thingspeak.com/channels/854872/fields/" +
      (index + 1) +
      "/last"
    )
      .then(response => response.json())
      .then(response => {
        this.setState({ currentReading: response });
        // Fetch historical data and make prediction
        this.fetchHistoricalData(index);
      });
  }

  fetchHistoricalData(index) {
    // Fetch last 24 data points from ThingSpeak
    fetch(
      "https://api.thingspeak.com/channels/854872/fields/" +
      (index + 1) +
      ".json?results=24"
    )
      .then(response => response.json())
      .then(data => {
        if (data.feeds && data.feeds.length > 0) {
          const fieldKey = "field" + (index + 1);
          const historicalData = data.feeds
            .map(feed => ({
              value: parseFloat(feed[fieldKey]),
              timestamp: new Date(feed.created_at)
            }))
            .filter(item => !isNaN(item.value));

          this.setState({ historicalData }, () => {
            this.predictNextHour();
          });
        }
      })
      .catch(error => {
        console.error("Error fetching historical data:", error);
      });
  }

  getTimeOfDayFactor() {
    const hour = new Date().getHours();
    // Morning rush (6-9 AM)
    if (hour >= 6 && hour < 9) {
      return 1.2;
    }
    // Evening rush (5-8 PM)
    else if (hour >= 17 && hour < 20) {
      return 1.3;
    }
    // Late night (12-2 AM)
    else if (hour >= 0 && hour < 2) {
      return 0.8;
    }
    // Normal times
    return 1.0;
  }

  calculateExponentialSmoothing(data) {
    if (data.length === 0) return null;

    const alpha = 0.3; // Smoothing factor
    let forecast = data[0].value; // Initialize with first value

    // Apply exponential smoothing
    for (let i = 1; i < data.length; i++) {
      forecast = alpha * data[i].value + (1 - alpha) * forecast;
    }

    return forecast;
  }

  predictNextHour() {
    const { historicalData } = this.state;

    if (historicalData.length < 2) {
      // Not enough data for prediction
      this.setState({ showPredictionAlert: false });
      return;
    }

    // Calculate base prediction using exponential smoothing
    const basePrediction = this.calculateExponentialSmoothing(historicalData);

    if (basePrediction === null) {
      this.setState({ showPredictionAlert: false });
      return;
    }

    // Apply time-of-day adjustment
    const timeOfDayFactor = this.getTimeOfDayFactor();
    const predictedPPM = Math.round(basePrediction * timeOfDayFactor);

    // Check if prediction exceeds thresholds
    const showAlert = predictedPPM > 2000;

    this.setState({
      predictedPPM,
      showPredictionAlert: showAlert
    });
  }
  sensorLocations = [
    {
      lat: 17.5975733,
      long: 78.1270862
    },
    {
      lat: 17.5976267,
      long: 78.126699
    },
    {
      lat: 17.5947351,
      long: 78.1235458
    }
  ];
  haversineDistance(lat1, lon1, lat2, lon2) {
    function toRad(x) {
      return (x * Math.PI) / 180;
    }

    var R = 6371; // km

    var x1 = lat2 - lat1;
    var dLat = toRad(x1);
    var x2 = lon2 - lon1;
    var dLon = toRad(x2);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;
    return d * 1000;
  }
  setSensorLocation(sensorIndex) {
    this.setState({
      minimumIndex: sensorIndex,
      minimumDistance: this.haversineDistance(
        this.sensorLocations[sensorIndex].lat,
        this.sensorLocations[sensorIndex].long,
        this.state.latitude,
        this.state.longitude
      ),
      customSelected: true
    });
    if (sensorIndex == 0) {
      this.setState({ nearestSensor: "Hostel Block E" });
    } else if (sensorIndex == 1) {
      this.setState({ nearestSensor: "Hostel Block B" });
    } else if (sensorIndex == 2) {
      this.setState({ nearestSensor: "Academic Block A" });
    }
    this.getSensorReading(sensorIndex);
  }
  findNearestSensor(myLat, myLong) {
    let minimumDistance = this.haversineDistance(
      this.sensorLocations[0].lat,
      this.sensorLocations[0].long,
      myLat,
      myLong
    );
    let minimumIndex = 0;
    let x = 0;
    this.sensorLocations.forEach(location => {
      if (
        this.haversineDistance(location.lat, location.long, myLat, myLong) <
        minimumDistance
      ) {
        minimumIndex = x;
        minimumDistance = this.haversineDistance(
          location.lat,
          location.long,
          myLat,
          myLong
        );
      }
      x++;
    });
    this.setState({
      minimumDistance: minimumDistance,
      minimumIndex: minimumIndex
    });
    this.getSensorReading(minimumIndex);
  }
  findAndUpdateLocation() {
    if (!navigator.geolocation) {
      alert(
        "Sorry, we are unable to process your location. Please manually select the nearest sensor. "
      );
    } else {
      navigator.geolocation.getCurrentPosition(position => {
        this.setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        this.findNearestSensor(
          position.coords.latitude,
          position.coords.longitude
        );

        if (this.state.minimumIndex == 0) {
          this.setState({ nearestSensor: "Hostel Block E" });
        } else if (this.state.minimumIndex == 1) {
          this.setState({ nearestSensor: "Hostel Block B" });
        } else {
          this.setState({ nearestSensor: "Academic Block A" });
        }
      });
    }
  }
  componentDidMount() {
    this.findAndUpdateLocation();
  }
  statusOK() {
    return <Text>The air is safe to breathe. </Text>;
  }
  statusMedium() {
    return <Text>The air is slightly polluted. Try to stay indoors. </Text>;
  }
  statusBad() {
    return <Text>The air is very polluted. Definitely stay indoors. </Text>;
  }
  statusShower() {
    if (this.state.currentReading <= 1000) {
      return <Box color="status-ok">{this.statusOK()}</Box>;
    } else if (this.state.currentReading <= 2000) {
    } else {
    }
  }
  render() {
    return (
      <Grommet>
        <Box
          tag="header"
          direction="row"
          align="center"
          justify="center"
          background="brand"
          pad="medium"
          elevation="medium"
          style={{ zIndex: "1" }}
        >
          \u003cText size=\"xlarge\"\u003eWelcome to BreatheSafe\u003c/Text\u003e
        </Box>
        <Box align="center">
          <Text
            size="medium"
            margin={{ left: "medium", top: "medium", right: "medium" }}
            align="center"
          >
            Your current location is <br />
            Latitude: {this.state.latitude}
            <br /> Longitude: {this.state.longitude}.
          </Text>
          <Text
            size="medium"
            margin={{ left: "medium", top: "medium", right: "medium" }}
          >
            {this.state.customSelected ? (
              <div>
                This sensor is at {this.state.nearestSensor} and is{" "}
                {Math.floor(this.state.minimumDistance)} metres away.{" "}
              </div>
            ) : (
              <div>
                The nearest sensor is at {this.state.nearestSensor} and is{" "}
                {Math.floor(this.state.minimumDistance)} metres away.
              </div>
            )}
          </Text>
          <Text size="medium"></Text>
          <Box direction="row" margin="medium" align="center">
            <MapLocation size="large" />
            <Menu
              label="Select Location"
              defaultChecked="1"
              margin={{ left: "small" }}
              items={[
                {
                  label: "Hostel Block E",
                  onClick: () => {
                    this.setSensorLocation(0);
                  }
                },
                {
                  label: "Hostel Block B",
                  onClick: () => {
                    this.setSensorLocation(1);
                  }
                },
                {
                  label: "Academic Block A",
                  onClick: () => {
                    this.setSensorLocation(2);
                  }
                }
              ]}
            />
          </Box>
          <Box margin={{ top: "small" }}>
            <iframe
              width="350"
              height="250"
              style={{ border: "0px" }}
              src={
                "https://thingspeak.com/channels/854872/charts/" +
                (this.state.minimumIndex + 1) +
                "?dynamic=true&width=350"
              }
            ></iframe>
          </Box>
          {this.state.showPredictionAlert && (
            <Box
              align="center"
              background={{
                color: this.decideColor(this.state.predictedPPM),
                dark: true
              }}
              style={{ color: "white", borderRadius: "10px" }}
              margin={{ top: "medium" }}
              pad={{
                left: "medium",
                right: "medium",
                top: "medium",
                bottom: "medium"
              }}
            >
              <Text weight="bold" size="medium">
                ⚠️ Prediction Alert
              </Text>
              <Text size="small" margin={{ top: "small" }}>
                {this.state.predictedPPM > 3000
                  ? "Very high air pollution expected in the next hour. Stay indoors!"
                  : "Elevated air pollution expected in the next hour. Consider staying indoors."}
              </Text>
              <Text size="small" margin={{ top: "xsmall" }}>
                Predicted PPM: {this.state.predictedPPM}
              </Text>
            </Box>
          )}
          <Box
            align="center"
            background={{
              color: this.decideColor(),
              dark: true
            }}
            style={{ color: "white", borderRadius: "10px" }}
            margin={{ top: "medium" }}
            pad={{
              left: "medium",
              right: "medium",
              top: "medium",
              bottom: "medium"
            }}
          >
            {this.statusShower()}
            <br /> PPM Level = {this.state.currentReading}
          </Box>
        </Box>
      </Grommet>
    );
  }
}

export default App;
