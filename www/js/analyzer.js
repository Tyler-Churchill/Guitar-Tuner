
$(document).ready(function () {
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
	var page1 = $('#page-1');
	var page2 = $('#page-2');
	var tSelect = $('select');
	var target = document.getElementById('tuner-gauge');
	var gauge = new Gauge(target).setOptions(opts);

	$('#flat').hide();
	tSelect.material_select();
	page2.hide();
	page1.fadeIn();
	$('#done').hide();
	$('#start-tuning').click(function() {page1.hide(); page2.show(); page2.addClass( "animated bounceInLeft" ); 		audioContext = new window.AudioContext();});

	$('select').on('change', function() {
		notesArray = freqTable[this.value];
	});

	  gauge.maxValue = 100; // set max gauge value
	  gauge.setMinValue(0);  // Prefer setter over gauge.minValue = 0
	  gauge.animationSpeed = 22; // set animation speed (32 is default value)
	  gauge.set(0);

	/*****************************************
	*
	*	Start the audio processing code
	********************************************/

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

		// $.getJSON('../json/tunings.json', function (data, err) {
	
		// 	freqTable = data;
		// });
		freqTable = {
			"standard": [
				{
				  "note":"E2",
				  "frequency":82.41
				},
				{
				  "note":"A2",
				  "frequency":110.00
				},
				{
				  "note":"D3",
				  "frequency":146.83
				},
				{
				  "note":"G3",
				  "frequency":196.00
				},
				{
				  "note":"B3",
				  "frequency":246.94
				},
				{
				  "note":"E4",
				  "frequency":329.63
				}
			  ],
			  "dropd": [
				  {
					"note":"D2",
					"frequency":73.42
				  },
				  {
					"note":"A2",
					"frequency":110.00
				  },
				  {
					"note":"D3",
					"frequency":146.83
				  },
				  {
					"note":"G3",
					"frequency":196.00
				  },
				  {
					"note":"B3",
					"frequency":246.94
				  },
				  {
					"note":"E4",
					"frequency":329.63
				  }
				]
			}
			

		if (isAudioContextSupported()) {
			//audioContext = new window.AudioContext();
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
				// note is float
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
		// We use Autocorrelation to find the fundamental frequency.

		// In order to correlate the signal with itself (hence the name of the algorithm), we will check two points 'k' frames away.
		// The autocorrelation index will be the average of these products. At the same time, we normalize the values.
		// Source: http://www.phy.mty.edu/~suits/autocorrelation.html
		// Assuming the sample rate is 48000Hz, a 'k' equal to 1000 would correspond to a 48Hz signal (48000/1000 = 48),
		// while a 'k' equal to 8 would correspond to a 6000Hz one, which is enough to cover most (if not all)
		// the notes we have in the notes.json?_ts=1486418428668 file.
		var n = 1024; //buffer size
		var bestK = -1;
		var bestR = 0;
		for (var k = 8; k <= 1000; k++) {
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
				break;
			}
		}
		if (bestR > 0.002) {
				// The period (in frames) of the fundamental frequency is 'bestK'. Getting the frequency from there is trivial.
			var fundamentalFreq = sampleRate / bestK;
			console.log(fundamentalFreq);
			return fundamentalFreq;
		}
		else {
			return -1;
		}
	};

	var findClosestNote = function (freq, notes) {
		// Use binary search to find the closest note
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
			// notes[high] is closer to the frequency we found
			return notes[high];
		}

		return notes[low];
	};

	var findCentsOffPitch = function (freq, refFreq) {
		// We need to find how far freq is from baseFreq in cents
		var log2 = 0.6931471805599453; // Math.log(2)
		var multiplicativeFactor = freq / refFreq;
		console.log("freq " + freq + " refFreq " + refFreq );
		// We use Math.floor to get the integer part and ignore decimals
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
			//updateNote('--');
			updateCents(-50);
		}
	};

	var streamReceived = function (stream) {
		console.log("stream recieved");
		micStream = stream;

		analyserAudioNode = audioContext.createAnalyser();
		analyserAudioNode.fftSize = 4096;

		sourceAudioNode = audioContext.createMediaStreamSource(micStream);
		sourceAudioNode.connect(analyserAudioNode);
		setInterval(detectPitch, 200);
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
				$("#notes").append($('<li>').text(freqTable[x].note));
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
