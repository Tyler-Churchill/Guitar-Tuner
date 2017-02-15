
$(document).ready(function() {
	var opts = {
		angle: -0.15, // The span of the gauge arc
		lineWidth: 0.5, // The line thickness
		radiusScale: 1, // Relative radius
		pointer: {
			length: 0.9, // // Relative to gauge radius
			strokeWidth: 0.065, // The thicccccness
			color: '#000000'
		},
		strokeColor: '#E0E0E0',
		generateGradient: true,
		limitMax: true,
		limitMin: true,
		strokeColor: '#E0E0E0',
		generateGradient: true,
		highDpiSupport: true,
		staticZones: [
   {strokeStyle: "#f44336", min: 1, max: 35}, // Red
   {strokeStyle: "#ffeb3b", min: 35, max: 45}, // Yellow
   {strokeStyle: "#4caf50", min: 45, max: 55}, // Green
   {strokeStyle: "#ffeb3b", min: 55, max: 65}, // Yellow
   {strokeStyle: "#f44336", min: 65, max: 99}  // Red
]
	};
	var target = document.getElementById('tuner-gauge');
	var gauge = new Gauge(target).setOptions(opts);

$('#flat').hide();

		$('#start-tuning').click(function() { console.log("test")});

		$('#select-tuning').on('change', function() {
		  //alert( this.value );
			// updated
				notesArray = freqTable[this.value];
			//Materialize.toast('Tuning switched to ' + $('select').find('option:selected').text, 4000)
		});


	gauge.maxValue = 100; // set max gauge value
  gauge.setMinValue(0);  // Prefer setter over gauge.minValue = 0
  gauge.animationSpeed = 22; // set animation speed (32 is default value)
  gauge.set(0);





	var baseFreq = "standard";
	var currentNoteIndex = 0; // A4
	var isRefSoundPlaying = false;
	var isMicrophoneInUse = false;
	var frameId,
		freqTable,
		gauge,
		micStream,
		notesArray,
		audioContext,
		sourceAudioNode,
		analyserAudioNode;

	var isAudioContextSupported = function () {
		// This feature is still prefixed in Safari
		window.AudioContext = window.AudioContext || window.webkitAudioContext;
		if (window.AudioContext) {
			return true;
		}
		else {
			return false;
		}
	};

	var reportError = function (message) {
		$('#errorMessage').html(message).show();
	};

	var init = function () {
		$.getJSON('../json/tunings.json', function (data) {
			freqTable = data;
		});

		if (isAudioContextSupported()) {
			audioContext = new window.AudioContext();
		}
		else {
			reportError('AudioContext is not supported in this browser');
		}
	};

	var updatePitch = function (pitch) {
		console.log("updated pitch");
		$('#pitch').text(pitch + ' Hz');
	};

	var updateNote = function (note) {
		$('#note').text(note);
	};

	var updateCents = function (cents) {
		$('#cents').text(cents);
		if(cents < 0 || cents >= -2) {
				$('#done').hide();
				$('#sharp').hide();
				$('#flat').show();
		} else if(cents > 2){
			$('#done').hide();
			$('#flat').hide();
			$('#sharp').show();
		} else {
			$('#flat').hide();
			$('#sharp').hide();
			$('#done').show();
		}
		gauge.set(cents + 50);
	};

	var isGetUserMediaSupported = function () {
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
		if ((navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || navigator.getUserMedia) {
			return true;
		}

		return false;
	};

	var findFundamentalFreq = function (buffer, sampleRate) {
		var n = 1024; //buffer size
		var bestK = -1;
		var bestR = 0;
		for (var k = 8; k <= 48; k++) {
			var sum = 0;

			for (var i = 0; i < n; i++) {
				sum += ((buffer[i] - 128) / 128) * ((buffer[i + k] - 128) / 128);
			}

			var r = sum / (n + k);

			if (r > bestR) {
				bestR = r;
				bestK = k;
			}

			if (r > 0.9) {
				// Let's assume that this is good enough and stop right here
				break;
			}
		}
		if (bestR > 0.0025) {
			var fundamentalFreq = sampleRate / bestK;
			console.log(fundamentalFreq);
			return fundamentalFreq;
		}
		else {
			return -1;
		}
	};

	var findClosestNote = function (freq, notes) {
		var low = 0;
		var high = notes.length - 1;
		while (high - low > 1) {
			var pivot = Math.round((low + high) / 2);
			if (notes[pivot].frequency <= freq) {
				low = pivot;
			} else {
				high = pivot;
			}
		}
		if (Math.abs(notes[high].frequency - freq) <= Math.abs(notes[low].frequency - freq)) {
			return notes[high];
		}
		return notes[low];
	};

	var findCentsOffPitch = function (freq, refFreq) {
		var log2 = 0.6931471805599453; // Math.log(2)
		var multiplicativeFactor = freq / refFreq;
		console.log("freq " + freq + " refFreq " + refFreq );
		var cents = Math.floor(1200 * (Math.log(multiplicativeFactor) / log2));
		return cents;
	};

	var detectPitch = function () {
		var buffer = new Uint8Array(analyserAudioNode.fftSize);
		analyserAudioNode.getByteTimeDomainData(buffer);
		var fundalmentalFreq = findFundamentalFreq(buffer, audioContext.sampleRate);
		if (fundalmentalFreq !== -1) {
			var note = findClosestNote(fundalmentalFreq, notesArray);
			var cents = findCentsOffPitch(fundalmentalFreq, note.frequency);
			updateNote(note.note);
			updateCents(cents);
		}
		else {
			updateNote('--');
			updateCents(-50);
		}
	};

	var streamReceived = function (stream) {
		console.log("stream recieved");
		micStream = stream;
		analyserAudioNode = audioContext.createAnalyser();
		analyserAudioNode.fftSize = 2048;
		sourceAudioNode = audioContext.createMediaStreamSource(micStream);
		sourceAudioNode.connect(analyserAudioNode);
		setInterval(detectPitch, 350);
	};


	var turnOffMicrophone = function () {
		if (sourceAudioNode && sourceAudioNode.mediaStream && sourceAudioNode.mediaStream.stop) {
			sourceAudioNode.mediaStream.stop();
		}
		sourceAudioNode = null;
		updatePitch('--');
		updateNote('--');
		updateCents(-50);
		$('#micButton').text("Turn on microphone");

		analyserAudioNode = null;
		isMicrophoneInUse = false;
	};
	var toggleMicrophone = function () {
		if (isRefSoundPlaying) {
			turnOffReferenceSound();
		}
		if (!isMicrophoneInUse) {
			$('#micButton').text("Turn off microphone");
			for(var x = 0; x < freqTable.length; x++) {
				$("#notes").append($('<li>').text(freqTable[x].note.toString()));
			}
			if (isGetUserMediaSupported()) {
				notesArray = freqTable["standard"];
				var getUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ?
					navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices) :
					function (constraints) {
						return new Promise(function (resolve, reject) {
							navigator.getUserMedia(constraints, resolve, reject);
						});
					};
				getUserMedia({audio: true}).then(streamReceived).catch(reportError);
				updatePitch(baseFreq);
				isMicrophoneInUse = true;
			}
			else {
				reportError('It looks like this browser does not support getUserMedia. ' +
				'Check <a href="http://caniuse.com/#feat=stream">http://caniuse.com/#feat=stream</a> for more info.');
			}
		}
		else {
			turnOffMicrophone();
		}
	};

	var changeBaseFreq = function (delta) {
		var newBaseFreq = baseFreq + delta;
		if (newBaseFreq >= 432 && newBaseFreq <= 446) {
			baseFreq = newBaseFreq;
			notesArray = freqTable["standard"];
			updatePitch(baseFreq);
		}
	};

	var changeReferenceSoundNote = function (delta) {
		if (isRefSoundPlaying) {
			var newNoteIndex = currentNoteIndex + delta;
			if (newNoteIndex >= 0 && newNoteIndex < notesArray.length) {
				currentNoteIndex = newNoteIndex;
				var newNoteFreq = notesArray[currentNoteIndex].frequency;
				sourceAudioNode.frequency.value = newNoteFreq;
				// In this case we haven't changed the base frequency, so we just need to update the note on screen
				updateNote(notesArray[currentNoteIndex].note);

			}
		}
	};

	var baseFreqChangeHandler = function (event) {
		changeBaseFreq(event.data);
	};

	var referenceSoundNoteHandler = function (event) {
		changeReferenceSoundNote(event.data);
	};

		$('#micButton').click(toggleMicrophone);

	init();
});
