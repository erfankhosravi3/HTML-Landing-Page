/* IronLog — ExerciseDB: built-in exercise encyclopedia (ExRx-style), 250+ entries. */
(function () {
  'use strict';

  const ExerciseDB = {};

  /* ---------- canonical vocab (contract: exactly these ids) ---------- */

  ExerciseDB.MUSCLES = [
    { id: 'chest', label: 'Chest', short: 'Chest' },
    { id: 'front_delts', label: 'Front Delts', short: 'F.Delts' },
    { id: 'side_delts', label: 'Side Delts', short: 'S.Delts' },
    { id: 'rear_delts', label: 'Rear Delts', short: 'R.Delts' },
    { id: 'traps', label: 'Traps', short: 'Traps' },
    { id: 'lats', label: 'Lats', short: 'Lats' },
    { id: 'upper_back', label: 'Upper Back', short: 'U.Back' },
    { id: 'lower_back', label: 'Lower Back', short: 'L.Back' },
    { id: 'biceps', label: 'Biceps', short: 'Biceps' },
    { id: 'triceps', label: 'Triceps', short: 'Triceps' },
    { id: 'forearms', label: 'Forearms', short: 'F.Arms' },
    { id: 'abs', label: 'Abs', short: 'Abs' },
    { id: 'obliques', label: 'Obliques', short: 'Obliq' },
    { id: 'glutes', label: 'Glutes', short: 'Glutes' },
    { id: 'quads', label: 'Quads', short: 'Quads' },
    { id: 'hamstrings', label: 'Hamstrings', short: 'Hams' },
    { id: 'adductors', label: 'Adductors', short: 'Adduct' },
    { id: 'calves', label: 'Calves', short: 'Calves' }
  ];

  ExerciseDB.MUSCLE_LABEL = {};
  ExerciseDB.MUSCLES.forEach(function (m) { ExerciseDB.MUSCLE_LABEL[m.id] = m.label; });

  ExerciseDB.EQUIPMENT = [
    { id: 'barbell', label: 'Barbell' },
    { id: 'dumbbell', label: 'Dumbbell' },
    { id: 'kettlebell', label: 'Kettlebell' },
    { id: 'machine', label: 'Machine' },
    { id: 'cable', label: 'Cable' },
    { id: 'bodyweight', label: 'Bodyweight' },
    { id: 'band', label: 'Band' },
    { id: 'smith', label: 'Smith Machine' },
    { id: 'ez_bar', label: 'EZ Bar' },
    { id: 'trap_bar', label: 'Trap Bar' },
    { id: 'other', label: 'Other' }
  ];

  ExerciseDB.CATEGORIES = [
    { id: 'push', label: 'Push' },
    { id: 'pull', label: 'Pull' },
    { id: 'legs', label: 'Legs' },
    { id: 'core', label: 'Core' },
    { id: 'cardio', label: 'Cardio' },
    { id: 'full_body', label: 'Full Body' },
    { id: 'olympic', label: 'Olympic' },
    { id: 'durability', label: 'Durability' },
    { id: 'mobility', label: 'Mobility' }
  ];

  /* ---------- builder ---------- */

  function E(id, name, aliases, primaryMuscles, secondaryMuscles, equipment, category, mechanics, level, instructions, tips) {
    return {
      id: id, name: name, aliases: aliases,
      primaryMuscles: primaryMuscles, secondaryMuscles: secondaryMuscles,
      equipment: equipment, category: category, mechanics: mechanics, level: level,
      instructions: instructions, tips: tips
    };
  }

  /* ---------- built-in database ---------- */

  const EXERCISES = [

    /* ===== CHEST ===== */

    E('barbell_bench_press', 'Barbell Bench Press', ['bench press', 'flat bench', 'bb bench'],
      ['chest'], ['front_delts', 'triceps'], 'barbell', 'push', 'compound', 'beginner', [
        'Lie on the bench with your eyes under the bar, feet planted flat, and shoulder blades pinched together and driven into the pad.',
        'Grip the bar slightly wider than shoulder width, unrack it, and hold it locked out over your shoulders.',
        'Inhale and lower the bar under control to your mid-chest, elbows tucked about 45 degrees from your torso.',
        'Press the bar back up and slightly toward your face to lockout, exhaling through the sticking point.'
      ], [
        'Keep your shoulder blades retracted the entire set — never shrug forward at lockout.',
        'Touch the chest quietly; bouncing the bar robs tension and risks injury.'
      ]),

    E('incline_barbell_bench_press', 'Incline Barbell Bench Press', ['incline bench press', 'incline bench'],
      ['chest'], ['front_delts', 'triceps'], 'barbell', 'push', 'compound', 'intermediate', [
        'Set the bench to a 30-45 degree incline and lie back with feet planted and upper back tight.',
        'Grip slightly wider than shoulder width and unrack the bar over your collarbones.',
        'Lower the bar under control to your upper chest just below the clavicles, inhaling on the way down.',
        'Drive the bar up and slightly back to lockout over your shoulders, exhaling as you press.'
      ], [
        'A steeper incline shifts work to the shoulders — stay near 30 degrees to keep it on the upper chest.',
        'Do not let the elbows flare straight out; keep them under the bar.'
      ]),

    E('decline_barbell_bench_press', 'Decline Barbell Bench Press', ['decline bench press'],
      ['chest'], ['triceps', 'front_delts'], 'barbell', 'push', 'compound', 'intermediate', [
        'Lie on a decline bench with your legs hooked under the pads and grip the bar slightly wider than shoulder width.',
        'Unrack and hold the bar over your lower chest with arms locked.',
        'Lower the bar under control to the base of your chest, keeping wrists stacked over elbows.',
        'Press back to lockout, exhaling forcefully through the top half.'
      ], [
        'Use a spotter for the unrack — the decline angle makes it awkward alone.'
      ]),

    E('dumbbell_bench_press', 'Dumbbell Bench Press', ['db bench press', 'flat dumbbell press'],
      ['chest'], ['front_delts', 'triceps'], 'dumbbell', 'push', 'compound', 'beginner', [
        'Sit with the dumbbells on your thighs, then kick them up as you lie back so they start over your chest.',
        'Plant your feet, pinch your shoulder blades, and press the dumbbells to lockout over your shoulders.',
        'Lower both bells under control until you feel a stretch across the chest, elbows about 45 degrees from your sides.',
        'Press up and slightly inward until the bells nearly touch, exhaling as you drive.'
      ], [
        'Do not clang the dumbbells together at the top — it bleeds tension from the chest.',
        'Kick the bells back to your thighs as you sit up to finish safely.'
      ]),

    E('incline_dumbbell_press', 'Incline Dumbbell Press', ['incline db press', 'incline dumbbell bench'],
      ['chest'], ['front_delts', 'triceps'], 'dumbbell', 'push', 'compound', 'beginner', [
        'Set the bench to about 30 degrees, kick the dumbbells up, and lie back with them at shoulder level.',
        'Press the bells up and slightly together until your arms are locked over your upper chest.',
        'Lower under control until your elbows drop just below the bench line, inhaling on the descent.',
        'Drive back up without letting the bells drift out wide, exhaling through the press.'
      ], [
        'Keep a slight inward tilt of the dumbbells to keep tension on the upper pecs.'
      ]),

    E('decline_dumbbell_press', 'Decline Dumbbell Press', ['decline db press'],
      ['chest'], ['triceps', 'front_delts'], 'dumbbell', 'push', 'compound', 'intermediate', [
        'Hook your legs into a decline bench and bring the dumbbells to your shoulders as you lie back.',
        'Press both bells to lockout over your lower chest.',
        'Lower under control to the sides of your lower chest, keeping forearms vertical.',
        'Press up and slightly together, exhaling as you drive.'
      ], [
        'Have a partner hand you the dumbbells — getting set up alone on a decline is the hard part.'
      ]),

    E('dumbbell_fly', 'Dumbbell Fly', ['chest fly', 'flat fly', 'dumbbell flye'],
      ['chest'], ['front_delts'], 'dumbbell', 'push', 'isolation', 'beginner', [
        'Lie flat holding light dumbbells over your chest, palms facing each other, with a soft bend in your elbows.',
        'Open your arms in a wide arc, lowering the bells out to your sides until you feel a deep chest stretch.',
        'Keep the elbow angle fixed — the movement happens only at the shoulder.',
        'Squeeze the bells back together along the same arc, as if hugging a barrel, exhaling on the way up.'
      ], [
        'Go lighter than you think — flys punish heavy loading at the stretched position.',
        'Do not turn it into a press by bending the elbows more as you tire.'
      ]),

    E('incline_dumbbell_fly', 'Incline Dumbbell Fly', ['incline fly', 'incline chest fly'],
      ['chest'], ['front_delts'], 'dumbbell', 'push', 'isolation', 'intermediate', [
        'Set the bench to about 30 degrees and hold light dumbbells over your upper chest, palms in.',
        'With elbows slightly bent and fixed, open your arms in a wide arc until you feel a stretch across the upper chest.',
        'Pause briefly at the bottom without letting the bells drop below shoulder level.',
        'Sweep the bells back together over your chest, exhaling and squeezing at the top.'
      ], [
        'Think about pushing the biceps toward each other, not the hands — it keeps the pecs doing the work.'
      ]),

    E('cable_fly', 'Cable Fly', ['cable chest fly', 'mid cable fly', 'standing cable fly'],
      ['chest'], ['front_delts'], 'cable', 'push', 'isolation', 'beginner', [
        'Set both pulleys to chest height, grab the handles, and step forward into a staggered stance.',
        'Start with arms open wide, a slight bend in the elbows, and chest up.',
        'Sweep both handles together in front of your chest in a hugging arc, exhaling as they meet.',
        'Return under control to the stretched position without letting the stacks touch down.'
      ], [
        'Cross the hands slightly at the end of each rep for a stronger peak contraction.',
        'Keep your torso still — leaning into each rep turns it into momentum.'
      ]),

    E('cable_crossover', 'Cable Crossover', ['high to low cable fly', 'high cable crossover'],
      ['chest'], ['front_delts'], 'cable', 'push', 'isolation', 'intermediate', [
        'Set both pulleys above shoulder height and take a handle in each hand, stepping forward into a split stance.',
        'Lean slightly forward with arms open and elbows softly bent.',
        'Pull both handles down and together toward your belt line, squeezing the lower chest as your hands cross.',
        'Let your arms rise back along the same path under control, feeling the stretch at the top.'
      ], [
        'The downward angle targets the lower chest — keep the arc smooth, no jerking the stacks.'
      ]),

    E('low_to_high_cable_fly', 'Low-to-High Cable Fly', ['low cable crossover', 'upward cable fly'],
      ['chest'], ['front_delts'], 'cable', 'push', 'isolation', 'intermediate', [
        'Set both pulleys to the lowest position and hold a handle in each hand at your sides, palms facing forward.',
        'Step forward into a staggered stance with a slight forward lean and chest proud.',
        'Sweep both handles up and together until they meet in front of your upper chest, exhaling as you squeeze.',
        'Lower back along the same arc under control, keeping tension on the cables.'
      ], [
        'This is a fly, not a front raise — lead with the pinky side of the hand and squeeze the upper pecs together.'
      ]),

    E('pec_deck', 'Pec Deck', ['machine fly', 'butterfly machine', 'chest fly machine'],
      ['chest'], ['front_delts'], 'machine', 'push', 'isolation', 'beginner', [
        'Adjust the seat so the handles sit at mid-chest height and your feet are flat on the floor.',
        'Sit tall with your back against the pad and grip the handles with slightly bent arms.',
        'Squeeze the handles together in front of your chest, exhaling and pausing for a one-count.',
        'Open your arms back under control until you feel a comfortable stretch — no further.'
      ], [
        'Set the range limiter so the stretch is deep but pain-free; do not let the weight yank your shoulders back.'
      ]),

    E('machine_chest_press', 'Machine Chest Press', ['seated chest press', 'chest press machine'],
      ['chest'], ['front_delts', 'triceps'], 'machine', 'push', 'compound', 'beginner', [
        'Set the seat so the handles line up with your mid-chest and sit with your back flat on the pad.',
        'Grip the handles, pull your shoulder blades back, and press to full extension without locking the elbows hard.',
        'Return under control until your hands are just in front of your chest, inhaling on the way back.',
        'Keep your head and hips on the pad throughout.'
      ], [
        'A great place to push close to failure safely — no bar to get pinned under.'
      ]),

    E('incline_machine_press', 'Incline Machine Press', ['incline chest press machine', 'machine incline press'],
      ['chest'], ['front_delts', 'triceps'], 'machine', 'push', 'compound', 'beginner', [
        'Adjust the seat so the handles start at upper-chest level and plant your feet.',
        'Press the handles up and forward to full extension, exhaling as you drive.',
        'Lower under control until your hands reach chest level, keeping the shoulder blades pinned.',
        'Repeat without bouncing out of the bottom.'
      ], [
        'Drive through the heel of your palm, not the fingers, to keep the wrists neutral.'
      ]),

    E('push_up', 'Push-Up', ['pushup', 'press up'],
      ['chest'], ['front_delts', 'triceps', 'abs'], 'bodyweight', 'push', 'compound', 'beginner', [
        'Set your hands slightly wider than shoulder width, arms locked, body in a straight line from head to heels.',
        'Brace your abs and glutes so your hips neither sag nor pike.',
        'Lower your chest to just above the floor, elbows tracking about 45 degrees from your torso, inhaling down.',
        'Press the floor away to full lockout, exhaling as you push.'
      ], [
        'If full reps break down, elevate your hands rather than dropping to your knees — it keeps the plank intact.',
        'Squeeze your glutes the whole set to protect your lower back.'
      ]),

    E('incline_push_up', 'Incline Push-Up', ['hands elevated push-up', 'bench push-up'],
      ['chest'], ['front_delts', 'triceps', 'abs'], 'bodyweight', 'push', 'compound', 'beginner', [
        'Place your hands on a bench or bar at hip-to-chest height, slightly wider than your shoulders.',
        'Walk your feet back until your body forms a straight, braced line.',
        'Lower your chest to the edge under control, elbows at about 45 degrees.',
        'Press back to lockout, exhaling; move to a lower surface as you get stronger.'
      ], [
        'The higher the hands, the easier the rep — progress by lowering the surface, not by sagging the hips.'
      ]),

    E('decline_push_up', 'Decline Push-Up', ['feet elevated push-up'],
      ['chest'], ['front_delts', 'triceps', 'abs'], 'bodyweight', 'push', 'compound', 'intermediate', [
        'Place your feet on a bench and your hands on the floor slightly wider than shoulder width.',
        'Brace hard so your body stays rigid from heels to head.',
        'Lower until your forehead nearly touches the floor, keeping elbows from flaring straight out.',
        'Press back to lockout, exhaling at the top.'
      ], [
        'Elevating the feet biases the upper chest and shoulders — expect fewer reps than flat push-ups.'
      ]),

    E('weighted_push_up', 'Weighted Push-Up', ['plate push-up', 'loaded push-up'],
      ['chest'], ['front_delts', 'triceps', 'abs'], 'bodyweight', 'push', 'compound', 'intermediate', [
        'Have a partner place a plate on your upper back, or wear a snug backpack or weight vest.',
        'Set up in a strict push-up position with hands slightly wider than shoulders.',
        'Lower your chest to the floor under control, keeping the plate stable over your upper back.',
        'Drive back to lockout, exhaling; keep the reps identical to your unweighted form.'
      ], [
        'Load sits on the upper back, never the lower back — a sliding plate means your hips are sagging.'
      ]),

    E('chest_dip', 'Chest Dip', ['chest dips', 'forward-lean dip'],
      ['chest'], ['triceps', 'front_delts'], 'bodyweight', 'push', 'compound', 'intermediate', [
        'Grip parallel bars, press to a locked-out support, and cross your ankles behind you.',
        'Lean your torso forward about 30 degrees and let your elbows travel out slightly.',
        'Lower until your shoulders dip just below your elbows, feeling a stretch across the chest.',
        'Press back to lockout while holding the forward lean, exhaling on the way up.'
      ], [
        'The forward lean is what makes it a chest exercise — stay upright and it becomes a triceps dip.',
        'Stop the descent if the front of your shoulder complains; depth is personal.'
      ]),

    E('smith_bench_press', 'Smith Machine Bench Press', ['smith bench'],
      ['chest'], ['front_delts', 'triceps'], 'smith', 'push', 'compound', 'beginner', [
        'Set a flat bench under the smith bar so the bar path meets your mid-chest.',
        'Lie back, grip slightly wider than shoulder width, and rotate the bar to unhook it.',
        'Lower to your mid-chest under control, keeping shoulder blades pinched.',
        'Press to lockout and re-hook the bar only when the set is done.'
      ], [
        'The fixed path lets you push near failure without a spotter — set the safety stops just below chest height.'
      ]),

    E('smith_incline_press', 'Smith Machine Incline Press', ['smith incline bench'],
      ['chest'], ['front_delts', 'triceps'], 'smith', 'push', 'compound', 'beginner', [
        'Set an incline bench at about 30 degrees under the smith bar so it touches your upper chest.',
        'Grip slightly wider than shoulder width and unhook the bar over your collarbones.',
        'Lower under control to the upper chest, inhaling on the descent.',
        'Drive to lockout, exhaling, and keep your hips on the bench.'
      ], [
        'Slide the bench forward or back until the bar path feels natural before loading plates.'
      ]),

    E('floor_press', 'Barbell Floor Press', ['bb floor press'],
      ['chest'], ['triceps', 'front_delts'], 'barbell', 'push', 'compound', 'intermediate', [
        'Lie on the floor under a bar racked at arms length, knees bent and feet flat.',
        'Grip slightly wider than shoulder width and unrack the bar over your shoulders.',
        'Lower until your upper arms rest gently on the floor, pausing for a one-count.',
        'Press back to lockout without bouncing the elbows, exhaling as you drive.'
      ], [
        'The dead stop kills momentum — great for lockout strength and shoulder-friendly pressing.'
      ]),

    E('svend_press', 'Svend Press', ['plate squeeze press', 'plate press'],
      ['chest'], ['front_delts', 'triceps'], 'other', 'push', 'isolation', 'beginner', [
        'Stand tall and press two small plates together between flat palms at chest height.',
        'Squeeze the plates hard so your pecs stay contracted throughout.',
        'Press the plates straight out until your arms are extended, exhaling slowly.',
        'Pull them back to your chest while maintaining the inward squeeze.'
      ], [
        'The load is trivial — the constant squeeze is the exercise. Squeeze harder, not heavier.'
      ]),

    E('band_chest_press', 'Band Chest Press', ['banded chest press', 'standing band press'],
      ['chest'], ['front_delts', 'triceps'], 'band', 'push', 'compound', 'beginner', [
        'Anchor a band behind you at chest height and hold an end in each hand at your armpits.',
        'Step forward into a split stance until the band has tension at the start.',
        'Press both hands forward until your arms are extended in front of your chest, exhaling.',
        'Return under control, resisting the band pulling you back.'
      ], [
        'Bands load the lockout hardest — squeeze the pecs at full extension for a beat each rep.'
      ]),

    /* ===== FRONT DELTS ===== */

    E('overhead_press', 'Overhead Press', ['OHP', 'military press', 'standing barbell press', 'strict press'],
      ['front_delts'], ['side_delts', 'triceps', 'abs'], 'barbell', 'push', 'compound', 'intermediate', [
        'Grip the bar just outside shoulder width and rest it on your front delts, elbows slightly ahead of the bar.',
        'Squeeze your glutes and brace your abs to lock your torso in place.',
        'Press the bar straight up, pulling your chin back to let it pass, exhaling as you drive.',
        'Finish with the bar stacked over your mid-foot and shoulders shrugged slightly up; lower under control to the collarbones.'
      ], [
        'If the bar drifts forward, the weight is beating your brace — tighten the glutes and ribs down.',
        'Push your head "through the window" once the bar clears your face.'
      ]),

    E('seated_barbell_press', 'Seated Barbell Shoulder Press', ['seated military press', 'seated OHP'],
      ['front_delts'], ['side_delts', 'triceps'], 'barbell', 'push', 'compound', 'intermediate', [
        'Set an upright bench inside a rack with the bar at shoulder height and sit with your back against the pad.',
        'Grip just outside shoulder width, unrack, and hold the bar at collarbone level.',
        'Press straight up to lockout over your ears, exhaling as you drive.',
        'Lower under control to your upper chest without bouncing.'
      ], [
        'Keep your lower back lightly against the pad — an aggressive arch turns this into an incline press.'
      ]),

    E('seated_dumbbell_press', 'Seated Dumbbell Shoulder Press', ['db shoulder press', 'seated db press'],
      ['front_delts'], ['side_delts', 'triceps'], 'dumbbell', 'push', 'compound', 'beginner', [
        'Sit on an upright bench, kick the dumbbells to your shoulders, palms facing forward.',
        'Brace your core and press both bells overhead until your arms lock out, exhaling.',
        'Lower under control until the bells reach ear level with forearms vertical.',
        'Keep your head neutral and let the bells travel slightly together at the top.'
      ], [
        'Stopping at ear level keeps constant tension; touching the shoulders each rep is a rest.',
        'If your lower back arches, lighten the load and re-brace.'
      ]),

    E('arnold_press', 'Arnold Press', ['arnold dumbbell press', 'rotational shoulder press'],
      ['front_delts'], ['side_delts', 'triceps'], 'dumbbell', 'push', 'compound', 'intermediate', [
        'Sit on an upright bench holding dumbbells at shoulder height, palms facing you, elbows in front.',
        'Press upward while rotating your palms outward, so they face forward at lockout.',
        'Reverse the rotation on the way down, returning to palms-in at the bottom.',
        'Keep the movement smooth — the rotation and press happen together, not in two stages.'
      ], [
        'Use less weight than a normal press; the rotation adds range and time under tension.'
      ]),

    E('machine_shoulder_press', 'Machine Shoulder Press', ['seated shoulder press machine'],
      ['front_delts'], ['side_delts', 'triceps'], 'machine', 'push', 'compound', 'beginner', [
        'Set the seat so the handles start at shoulder level and sit with your back on the pad.',
        'Grip the handles and press to full extension overhead, exhaling as you drive.',
        'Lower under control until your elbows reach roughly 90 degrees.',
        'Keep your hips and upper back on the pad the whole set.'
      ], [
        'Ideal for pushing shoulders near failure without balance demands — control the negative.'
      ]),

    E('smith_shoulder_press', 'Smith Machine Shoulder Press', ['smith overhead press'],
      ['front_delts'], ['side_delts', 'triceps'], 'smith', 'push', 'compound', 'beginner', [
        'Place an upright bench under the smith bar so the bar path lines up just in front of your face.',
        'Sit tall, grip just outside shoulder width, and rotate the bar off the hooks.',
        'Lower to chin level under control, then press to lockout, exhaling.',
        'Re-hook the bar at the top when the set ends.'
      ], [
        'Position the bench so the bar grazes your nose on the way down — too far forward strains the shoulders.'
      ]),

    E('push_press', 'Push Press', ['barbell push press'],
      ['front_delts'], ['side_delts', 'triceps', 'quads', 'glutes'], 'barbell', 'push', 'compound', 'intermediate', [
        'Stand with the bar racked on your front delts, grip just outside shoulders, elbows slightly forward.',
        'Dip by bending the knees a few inches, keeping your torso vertical.',
        'Drive explosively through your legs and punch the bar overhead to lockout.',
        'Lower the bar under control back to your shoulders, absorbing with a small knee bend.'
      ], [
        'The dip is shallow and quick — a slow, deep dip kills the bounce.',
        'Use it to overload the overhead press by 10-20 percent.'
      ]),

    E('landmine_press', 'Landmine Press', ['angled barbell press', 'landmine shoulder press'],
      ['front_delts'], ['chest', 'triceps', 'abs'], 'barbell', 'push', 'compound', 'beginner', [
        'Wedge one end of a barbell into a landmine or corner and hold the other end at your shoulder.',
        'Stand in a staggered stance, bracing your core against rotation.',
        'Press the bar up and forward along its arc until your arm is extended, exhaling.',
        'Lower slowly back to the shoulder without letting your torso twist.'
      ], [
        'The angled path is friendly to cranky shoulders — great pressing option when overhead hurts.'
      ]),

    E('dumbbell_front_raise', 'Dumbbell Front Raise', ['front raise'],
      ['front_delts'], ['side_delts'], 'dumbbell', 'push', 'isolation', 'beginner', [
        'Stand holding dumbbells in front of your thighs, palms facing your body.',
        'With a soft elbow, raise one or both bells straight in front of you to shoulder height, exhaling.',
        'Pause briefly at the top without shrugging.',
        'Lower under control back to your thighs — no swinging into the next rep.'
      ], [
        'If your torso rocks, the weight is too heavy; front delts respond to strict, light work.'
      ]),

    E('plate_front_raise', 'Plate Front Raise', ['plate raise'],
      ['front_delts'], ['side_delts', 'forearms'], 'other', 'push', 'isolation', 'beginner', [
        'Hold a plate at the 3 and 9 positions in front of your hips, standing tall.',
        'Raise the plate with nearly straight arms until it reaches eye level, exhaling.',
        'Hold for a one-count with your ribs down and glutes tight.',
        'Lower under control to your hips without letting the plate rest against you.'
      ], [
        'Squeezing the plate hard keeps the shoulders packed and stops the traps taking over.'
      ]),

    E('cable_front_raise', 'Cable Front Raise', ['low pulley front raise'],
      ['front_delts'], ['side_delts'], 'cable', 'push', 'isolation', 'beginner', [
        'Set a pulley to the lowest position, face away from the stack, and hold the handle in front of your thigh.',
        'With a soft elbow, raise the handle straight ahead to shoulder height, exhaling.',
        'Pause, then lower under control against the cable.',
        'Finish all reps on one arm before switching.'
      ], [
        'The cable keeps tension at the bottom where dumbbells go slack — control that first few inches.'
      ]),

    E('pike_push_up', 'Pike Push-Up', ['pike press'],
      ['front_delts'], ['triceps', 'side_delts', 'chest'], 'bodyweight', 'push', 'compound', 'intermediate', [
        'From a push-up position, walk your feet in and lift your hips high so your torso points down like an inverted V.',
        'Bend your elbows and lower the crown of your head toward the floor between your hands.',
        'Press back up until your arms lock, exhaling, keeping hips high the whole time.',
        'Elevate your feet on a box to make it harder as you progress.'
      ], [
        'Look at your feet, not forward — it keeps your neck neutral and the load on the shoulders.'
      ]),

    E('handstand_push_up', 'Handstand Push-Up', ['HSPU', 'wall handstand push-up'],
      ['front_delts'], ['triceps', 'side_delts', 'traps'], 'bodyweight', 'push', 'compound', 'advanced', [
        'Kick up into a handstand with your heels against a wall, hands just wider than shoulders.',
        'Brace your whole body and lower the top of your head to the floor under control.',
        'Press back to full lockout, exhaling hard through the sticking point.',
        'Keep your ribs tucked so your back does not arch into the wall.'
      ], [
        'Build up with pike push-ups and negatives first; a folded towel under the head marks depth.',
        'Come down safely by cartwheeling out — never collapse.'
      ]),

    E('z_press', 'Z Press', ['seated floor press', 'savickas press'],
      ['front_delts'], ['triceps', 'abs', 'upper_back'], 'barbell', 'push', 'compound', 'advanced', [
        'Sit on the floor with legs extended straight ahead, bar racked at shoulder height in front of you.',
        'Grip just outside shoulders and unrack so the bar rests at your collarbones.',
        'Press strictly overhead to lockout, exhaling — no back lean, no leg drive.',
        'Lower under control to the collarbones while staying tall through the spine.'
      ], [
        'Brutal for posture and core — start with just the bar; it exposes any lean immediately.'
      ]),

    E('kettlebell_press', 'Kettlebell Overhead Press', ['kb press', 'single arm kettlebell press'],
      ['front_delts'], ['side_delts', 'triceps', 'abs'], 'kettlebell', 'push', 'compound', 'intermediate', [
        'Clean a kettlebell to the rack position: elbow tucked, bell resting on your forearm at the shoulder.',
        'Squeeze your glutes, brace, and press the bell overhead until your elbow locks by your ear, exhaling.',
        'Keep your wrist neutral — the bell rests on the back of the forearm the whole way.',
        'Lower under control back to the rack position; complete all reps then switch arms.'
      ], [
        'Crush the handle as you press — grip tension noticeably boosts pressing strength.'
      ]),

    /* ===== SIDE DELTS ===== */

    E('dumbbell_lateral_raise', 'Dumbbell Lateral Raise', ['lateral raise', 'side raise', 'side lateral'],
      ['side_delts'], ['front_delts', 'traps'], 'dumbbell', 'push', 'isolation', 'beginner', [
        'Stand tall with dumbbells at your sides, palms facing in, a soft bend in the elbows.',
        'Raise both bells out to your sides, leading with the elbows, until your arms are parallel to the floor.',
        'Tilt the bells slightly as if pouring water at the top; exhale as you raise.',
        'Lower under control taking twice as long as the raise — no bouncing at the bottom.'
      ], [
        'Stop at shoulder height; higher just shifts the load to the traps.',
        'If you have to swing, the bells are too heavy — this is a strictness exercise.'
      ]),

    E('seated_lateral_raise', 'Seated Lateral Raise', ['seated side raise'],
      ['side_delts'], ['front_delts', 'traps'], 'dumbbell', 'push', 'isolation', 'beginner', [
        'Sit on the end of a bench with dumbbells hanging at your sides, torso tall.',
        'Raise both bells out to shoulder height with slightly bent elbows, exhaling.',
        'Pause for a one-count at the top without shrugging.',
        'Lower under control; sitting removes the leg swing that creeps into standing raises.'
      ], [
        'Sitting is an honesty check — expect to use less weight than standing.'
      ]),

    E('leaning_lateral_raise', 'Leaning Lateral Raise', ['egyptian lateral raise'],
      ['side_delts'], ['front_delts', 'traps'], 'dumbbell', 'push', 'isolation', 'intermediate', [
        'Hold an upright with one hand and lean away from it, feet close to its base, dumbbell in the outside hand.',
        'From the bell hanging at your side, raise it out to shoulder height, exhaling.',
        'The lean loads the delt from the very bottom of the range — control the first inches.',
        'Lower slowly, keeping tension, and finish the set before switching sides.'
      ], [
        'The lean removes the dead zone at the bottom of a standard raise — go lighter and feel the difference.'
      ]),

    E('cable_lateral_raise', 'Cable Lateral Raise', ['single arm cable lateral', 'cable side raise'],
      ['side_delts'], ['front_delts', 'traps'], 'cable', 'push', 'isolation', 'intermediate', [
        'Set a pulley to the lowest position and stand side-on to the stack, handle in your far hand.',
        'Start with the handle in front of your hips, cable running across your body.',
        'Raise your arm out to shoulder height with a soft elbow, exhaling.',
        'Lower under control, resisting the stack all the way down; switch sides after each set.'
      ], [
        'Cables load the bottom of the arc where dumbbells do not — this is the constant-tension option.'
      ]),

    E('machine_lateral_raise', 'Machine Lateral Raise', ['lateral raise machine'],
      ['side_delts'], ['front_delts', 'traps'], 'machine', 'push', 'isolation', 'beginner', [
        'Adjust the seat so your shoulders line up with the machine pivot and place your arms under the pads.',
        'Raise your elbows out to shoulder height, exhaling and pausing at the top.',
        'Lower under control without letting the stack slam.',
        'Keep your torso against the pad — no leaning to grind out reps.'
      ], [
        'Push these close to failure — the machine removes all balance and swing excuses.'
      ]),

    E('band_lateral_raise', 'Band Lateral Raise', ['banded side raise'],
      ['side_delts'], ['front_delts', 'traps'], 'band', 'push', 'isolation', 'beginner', [
        'Stand on the middle of a band and hold an end in each hand at your sides.',
        'Raise both hands out to shoulder height with soft elbows, exhaling against the growing resistance.',
        'Pause briefly at the top where the band is hardest.',
        'Lower slowly, resisting the snap-back.'
      ], [
        'Step wider on the band to increase resistance instead of hunting for a heavier band.'
      ]),

    E('barbell_upright_row', 'Barbell Upright Row', ['upright row'],
      ['side_delts', 'traps'], ['biceps', 'front_delts', 'forearms'], 'barbell', 'pull', 'compound', 'intermediate', [
        'Hold a barbell at your thighs with a grip a bit wider than shoulder width.',
        'Pull the bar straight up your body, leading with the elbows, until it reaches lower-chest height.',
        'Keep the elbows above the wrists throughout; exhale as you pull.',
        'Lower under control back to your thighs.'
      ], [
        'A wider grip and stopping at chest height keeps the shoulders happy — high, narrow pulls impinge.',
        'If it pinches, swap for lateral raises; no upright row is mandatory.'
      ]),

    E('dumbbell_upright_row', 'Dumbbell Upright Row', ['db upright row'],
      ['side_delts', 'traps'], ['biceps', 'forearms'], 'dumbbell', 'pull', 'compound', 'beginner', [
        'Stand with dumbbells resting on the front of your thighs, palms facing you.',
        'Pull both bells up along your body, elbows leading out and up, to lower-chest height.',
        'Exhale as you pull and keep the bells close to your torso.',
        'Lower under control; the dumbbells let your wrists rotate freely, easing shoulder strain.'
      ], [
        'Think "elbows to the ceiling" — the hands are just hooks.'
      ]),

    E('cable_upright_row', 'Cable Upright Row', ['rope upright row'],
      ['side_delts', 'traps'], ['biceps', 'forearms'], 'cable', 'pull', 'compound', 'intermediate', [
        'Attach a rope to a low pulley and hold an end in each hand at your thighs.',
        'Pull the rope up your body, spreading the ends apart as your elbows rise to shoulder height.',
        'Exhale as you pull; the rope lets your hands finish wide and comfortable.',
        'Lower under control, keeping tension on the cable.'
      ], [
        'Pulling the rope apart at the top turns this into a delt exercise instead of a trap shrug.'
      ]),

    /* ===== REAR DELTS ===== */

    E('face_pull', 'Face Pull', ['cable face pull', 'rope face pull'],
      ['rear_delts'], ['traps', 'upper_back', 'biceps'], 'cable', 'pull', 'isolation', 'beginner', [
        'Set a rope attachment at upper-chest to face height and grab the ends with thumbs pointing back.',
        'Step back until the cable is taut, arms extended in front of you.',
        'Pull the rope toward your face, splitting the ends beside your ears, elbows high and wide.',
        'Squeeze your rear delts and mid-back for a one-count, then return under control.'
      ], [
        'Finish each rep with your knuckles beside your ears and elbows behind your shoulders.',
        'Light weight, strict reps — this is posture medicine, not an ego lift.'
      ]),

    E('reverse_pec_deck', 'Reverse Pec Deck', ['rear delt machine', 'reverse fly machine'],
      ['rear_delts'], ['upper_back', 'traps'], 'machine', 'pull', 'isolation', 'beginner', [
        'Sit facing the pec deck pad with the handles set fully forward, arms extended at shoulder height.',
        'With a soft bend in the elbows, sweep the handles back until your arms are in line with your shoulders.',
        'Squeeze the rear delts and shoulder blades for a one-count, exhaling.',
        'Return under control without letting the stack pull you forward.'
      ], [
        'Keep your chest on the pad — driving with the torso is the most common cheat here.'
      ]),

    E('dumbbell_reverse_fly', 'Dumbbell Reverse Fly', ['bent over reverse fly', 'rear delt fly', 'bent over lateral raise'],
      ['rear_delts'], ['upper_back', 'traps'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Hinge at the hips until your torso is near parallel to the floor, dumbbells hanging under your chest, palms in.',
        'With soft elbows, raise both bells out to your sides until your arms are level with your back.',
        'Lead with the elbows and exhale as you raise; avoid squeezing the shoulder blades hard together.',
        'Lower under control without letting the bells swing.'
      ], [
        'Keeping the shoulder blades still isolates the rear delts; letting them pinch turns it into a row.',
        'Go light — the rear delts are small and momentum steals every rep.'
      ]),

    E('chest_supported_reverse_fly', 'Chest-Supported Reverse Fly', ['incline rear delt fly', 'prone reverse fly'],
      ['rear_delts'], ['upper_back', 'traps'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Lie chest-down on an incline bench set to about 30 degrees, dumbbells hanging beneath you.',
        'With slightly bent elbows, sweep the bells out and up until level with your shoulders.',
        'Pause and squeeze for a one-count, exhaling; the bench stops any body English.',
        'Lower slowly to the dead-hang start.'
      ], [
        'The bench removes cheating entirely — expect to use embarrassingly light dumbbells and love it.'
      ]),

    E('cable_reverse_fly', 'Cable Reverse Fly', ['reverse cable crossover', 'rear delt cable fly'],
      ['rear_delts'], ['upper_back', 'traps'], 'cable', 'pull', 'isolation', 'intermediate', [
        'Set both pulleys to shoulder height, grab the left handle with your right hand and vice versa, arms crossed in front.',
        'Stand centered with a slight forward lean and soft elbows.',
        'Sweep both arms out and back until they form a T, exhaling and squeezing the rear delts.',
        'Return under control, letting the cables cross again in front of you.'
      ], [
        'Keep the arc horizontal at shoulder height — drifting down turns it into a row.'
      ]),

    E('band_pull_apart', 'Band Pull-Apart', ['pull apart', 'band pull aparts'],
      ['rear_delts'], ['upper_back', 'traps'], 'band', 'pull', 'isolation', 'beginner', [
        'Hold a light band at shoulder height with straight arms, hands about shoulder-width apart.',
        'Pull the band apart until it touches your chest, arms finishing in a T, exhaling.',
        'Squeeze between the shoulder blades for a one-count.',
        'Return under control to the start without letting the band go slack.'
      ], [
        'Do these often — high-rep pull-aparts between pressing sets keep shoulders healthy.'
      ]),

    E('barbell_rear_delt_row', 'Barbell Rear Delt Row', ['wide grip bent over row', 'rear delt barbell row'],
      ['rear_delts'], ['upper_back', 'traps', 'biceps'], 'barbell', 'pull', 'compound', 'intermediate', [
        'Hinge to a near-parallel torso holding the bar with a very wide grip.',
        'Row the bar toward your upper chest with elbows flared out at nearly 90 degrees.',
        'Exhale as you pull and pause when the bar reaches your chest.',
        'Lower under control, keeping the wide elbow path every rep.'
      ], [
        'The high, flared elbow path is the whole point — rowing to the stomach makes it a lat exercise.'
      ]),

    E('cable_rear_delt_row', 'Cable Rear Delt Row', ['rope high row', 'face level row'],
      ['rear_delts'], ['upper_back', 'traps', 'biceps'], 'cable', 'pull', 'compound', 'beginner', [
        'Set a rope at upper-chest height, sit or stand facing the stack, and grab the ends.',
        'Row the rope toward your neck with elbows high and flared wide, exhaling.',
        'Squeeze the rear delts as your hands reach your shoulders.',
        'Return under control until your arms are fully extended.'
      ], [
        'Think of it as a face pull with more rowing — elbows stay at shoulder height throughout.'
      ]),

    /* ===== TRAPS ===== */

    E('barbell_shrug', 'Barbell Shrug', ['shrug', 'bb shrug'],
      ['traps'], ['forearms', 'upper_back'], 'barbell', 'pull', 'isolation', 'beginner', [
        'Stand holding a barbell at your thighs with a shoulder-width, double-overhand grip.',
        'Shrug your shoulders straight up toward your ears as high as possible, exhaling.',
        'Hold the top squeeze for a full one-count.',
        'Lower under control until your shoulders are fully depressed.'
      ], [
        'Straight up and down — rolling the shoulders adds nothing and irritates the joint.',
        'Use straps when grip fails before your traps do.'
      ]),

    E('dumbbell_shrug', 'Dumbbell Shrug', ['db shrug'],
      ['traps'], ['forearms'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Stand tall with heavy dumbbells at your sides, palms facing in.',
        'Shrug straight up toward your ears, exhaling, without bending the elbows.',
        'Squeeze hard at the top for a one-count.',
        'Lower slowly to a full stretch at the bottom.'
      ], [
        'The dumbbells hang at your sides, letting a more natural shrug path than a bar in front.'
      ]),

    E('trap_bar_shrug', 'Trap Bar Shrug', ['hex bar shrug'],
      ['traps'], ['forearms'], 'trap_bar', 'pull', 'isolation', 'beginner', [
        'Stand inside a loaded trap bar and deadlift it to standing with the neutral handles.',
        'Keeping arms straight, shrug your shoulders up toward your ears, exhaling.',
        'Pause at the top, then lower your shoulders fully under control.',
        'Keep your torso upright — the load stays centered on the trap bar.'
      ], [
        'The neutral grip and centered load let most lifters shrug heavier than with a barbell.'
      ]),

    E('cable_shrug', 'Cable Shrug', ['low pulley shrug'],
      ['traps'], ['forearms'], 'cable', 'pull', 'isolation', 'beginner', [
        'Attach a straight bar to a low pulley and stand tall holding it at your thighs.',
        'Shrug straight up against the cable, exhaling, without bending the elbows.',
        'Hold the top for a one-count squeeze.',
        'Lower slowly, letting the cable stretch the traps at the bottom.'
      ], [
        'Step back slightly so the cable pulls a touch forward — the traps fight a better line of resistance.'
      ]),

    E('smith_shrug', 'Smith Machine Shrug', ['smith machine shrugs'],
      ['traps'], ['forearms'], 'smith', 'pull', 'isolation', 'beginner', [
        'Set the smith bar at thigh height and grip it shoulder width, palms facing you.',
        'Unhook and shrug straight up as high as possible, exhaling.',
        'Squeeze at the top for a one-count.',
        'Lower under control to a full stretch; re-hook when done.'
      ], [
        'The fixed path means zero balance work — load it heavier than your barbell shrug and strap in.'
      ]),

    E('behind_back_barbell_shrug', 'Behind-the-Back Barbell Shrug', ['reverse shrug'],
      ['traps'], ['forearms', 'upper_back'], 'barbell', 'pull', 'isolation', 'intermediate', [
        'Hold a barbell behind your glutes with a shoulder-width overhand grip, standing tall.',
        'Shrug straight up, keeping the bar close to your body, exhaling.',
        'Pause at the top, then lower under control.',
        'Keep your chest proud — the rear bar position discourages slouching forward.'
      ], [
        'Set the bar on a rack at hand height to start — picking it up off the floor behind you is awkward.'
      ]),

    E('farmer_carry', 'Farmer Carry', ['farmers walk', 'farmer walk', 'loaded carry'],
      ['traps', 'forearms'], ['abs', 'obliques', 'glutes', 'calves'], 'dumbbell', 'full_body', 'compound', 'beginner', [
        'Deadlift a heavy dumbbell or kettlebell in each hand and stand tall, shoulders back.',
        'Walk with short, quick steps, ribs down, eyes forward, crushing the handles.',
        'Breathe shallowly behind a braced core — do not hold one giant breath for the whole walk.',
        'Walk a set distance or time, then lower the weights with a flat back.'
      ], [
        'Posture is the exercise: tall spine, packed shoulders — the moment you slouch, stop the set.',
        'Progress distance before load.'
      ]),

    E('prone_y_raise', 'Prone Y Raise', ['incline Y raise', 'lower trap raise'],
      ['traps'], ['rear_delts', 'upper_back'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Lie chest-down on an incline bench holding light dumbbells, arms hanging with thumbs up.',
        'Raise both arms overhead and slightly out to form a Y, exhaling.',
        'Squeeze the lower traps at the top for a one-count — arms stay straight.',
        'Lower under control to a dead hang.'
      ], [
        'This targets the neglected lower traps — 2 kg feels heavy done strictly. Do not load it.'
      ]),

    E('rack_pull', 'Rack Pull', ['block pull', 'partial deadlift'],
      ['traps', 'lower_back'], ['glutes', 'hamstrings', 'forearms', 'upper_back'], 'barbell', 'pull', 'compound', 'intermediate', [
        'Set the bar on rack pins or blocks just below knee height and grip shoulder width.',
        'Hinge to the bar with a flat back, brace, and pull your chest up until the slack leaves the bar.',
        'Drive through your heels and stand fully upright, finishing with glutes squeezed.',
        'Return the bar to the pins under control — no dropping from the top.'
      ], [
        'Heavier than your deadlift is the point, but keep the back flat — a partial range excuses nothing.',
        'Squeeze the bar hard and use straps for top sets.'
      ]),

    E('barbell_high_pull', 'Barbell High Pull', ['snatch grip high pull', 'high pull'],
      ['traps'], ['side_delts', 'glutes', 'hamstrings', 'forearms'], 'barbell', 'olympic', 'compound', 'intermediate', [
        'Hold the bar at your thighs with a wide grip, knees soft, torso hinged slightly forward.',
        'Explosively extend your hips and knees, shrugging hard as the bar accelerates.',
        'Let the elbows travel up and out, pulling the bar to lower-chest height.',
        'Guide the bar back down under control to the thighs and reset before the next rep.'
      ], [
        'It is a jump-and-shrug with a bar in your hands — the arms only finish what the hips start.'
      ]),

    /* ===== LATS ===== */

    E('pull_up', 'Pull-Up', ['pullup', 'overhand pull-up', 'wide grip pull-up'],
      ['lats'], ['biceps', 'upper_back', 'rear_delts', 'abs'], 'bodyweight', 'pull', 'compound', 'intermediate', [
        'Hang from a bar with an overhand grip just wider than shoulder width, arms fully extended.',
        'Set your shoulders by pulling the blades down before the arms bend.',
        'Drive your elbows down toward your hips until your chin clears the bar, exhaling.',
        'Lower under full control to a dead hang each rep — half range builds half a back.'
      ], [
        'Think of pulling the bar to you, elbows to your back pockets — not climbing over it.',
        'Kipping and half reps are different exercises; own the dead hang.'
      ]),

    E('chin_up', 'Chin-Up', ['chinup', 'underhand pull-up'],
      ['lats'], ['biceps', 'upper_back', 'abs'], 'bodyweight', 'pull', 'compound', 'intermediate', [
        'Hang from a bar with an underhand grip about shoulder width, arms fully extended.',
        'Pull your shoulder blades down, then drive your elbows toward your ribs.',
        'Pull until your chin clears the bar, exhaling near the top.',
        'Lower under control to a full hang — no dropping out of the top.'
      ], [
        'The supinated grip recruits more biceps, making it the easier entry to vertical pulling.'
      ]),

    E('neutral_grip_pull_up', 'Neutral-Grip Pull-Up', ['hammer grip pull-up', 'parallel grip pull-up'],
      ['lats'], ['biceps', 'upper_back', 'abs'], 'bodyweight', 'pull', 'compound', 'intermediate', [
        'Hang from parallel handles with palms facing each other, arms fully extended.',
        'Depress your shoulder blades, then pull your elbows down and back.',
        'Rise until your chin passes your hands, exhaling as you pull.',
        'Lower under control to a dead hang.'
      ], [
        'The friendliest grip for elbows and shoulders — the go-to when other pull-ups nag.'
      ]),

    E('weighted_pull_up', 'Weighted Pull-Up', ['weighted chin-up', 'belt pull-up'],
      ['lats'], ['biceps', 'upper_back', 'rear_delts', 'abs'], 'bodyweight', 'pull', 'compound', 'advanced', [
        'Attach weight with a dip belt (or hold a dumbbell between your feet) and take your usual grip.',
        'Settle into a controlled dead hang and set your shoulder blades.',
        'Pull until your chin clears the bar, exhaling — no swing to start the rep.',
        'Lower for a slow two-count to a full hang.'
      ], [
        'Earn these with 10+ strict bodyweight reps first; add weight in small jumps.'
      ]),

    E('assisted_pull_up', 'Assisted Pull-Up', ['machine assisted pull-up', 'band assisted pull-up'],
      ['lats'], ['biceps', 'upper_back'], 'machine', 'pull', 'compound', 'beginner', [
        'Set the assist weight (more assist = easier), kneel or stand on the platform, and grip the handles.',
        'Pull your shoulder blades down, then drive your elbows to your sides until your chin passes your hands.',
        'Exhale as you pull; pause briefly at the top.',
        'Lower under full control to straight arms.'
      ], [
        'Reduce the assistance a little each week — the machine is a ramp to real pull-ups, not a destination.'
      ]),

    E('lat_pulldown', 'Lat Pulldown', ['pulldown', 'wide grip pulldown', 'cable pulldown'],
      ['lats'], ['biceps', 'upper_back', 'rear_delts'], 'cable', 'pull', 'compound', 'beginner', [
        'Sit with thighs snug under the pads and grip the bar wider than shoulder width, palms forward.',
        'Lean back slightly, lift your chest, and pull your shoulder blades down first.',
        'Drive the bar to your upper chest with elbows tracking down and back, exhaling.',
        'Return the bar under control to a full overhead stretch — no stack slamming.'
      ], [
        'Pull with your elbows, not your hands; the lats attach at the elbow-side of the pull.',
        'Leaning way back turns it into a row and cheats the stretch.'
      ]),

    E('close_grip_pulldown', 'Close-Grip Lat Pulldown', ['v-bar pulldown', 'neutral grip pulldown'],
      ['lats'], ['biceps', 'upper_back'], 'cable', 'pull', 'compound', 'beginner', [
        'Attach a V-handle, sit locked under the pads, and take the neutral grip.',
        'From a full overhead stretch, pull the handle to your sternum, chest rising to meet it.',
        'Exhale as you pull and squeeze the lats with elbows tight to your ribs.',
        'Return under control to full extension, letting the lats stretch at the top.'
      ], [
        'The close neutral grip gives the longest lat range of any pulldown — use the full stretch.'
      ]),

    E('single_arm_lat_pulldown', 'Single-Arm Lat Pulldown', ['one arm pulldown', 'unilateral pulldown'],
      ['lats'], ['biceps', 'obliques'], 'cable', 'pull', 'compound', 'intermediate', [
        'Kneel or sit beside a high pulley with a D-handle in one hand, arm extended overhead.',
        'Pull the handle down to your shoulder, driving the elbow toward your hip, exhaling.',
        'Resist the urge to twist — your obliques brace against rotation.',
        'Return under control to a full stretch; complete all reps then switch arms.'
      ], [
        'Let the working shoulder rise a little at the top for an extra stretch, then depress it to start the pull.'
      ]),

    E('straight_arm_pulldown', 'Straight-Arm Pulldown', ['cable pullover', 'lat prayer', 'stiff arm pulldown'],
      ['lats'], ['triceps', 'abs'], 'cable', 'pull', 'isolation', 'intermediate', [
        'Face a high pulley holding a bar or rope with straight arms at shoulder height, torso hinged slightly forward.',
        'Keeping elbows locked in a soft bend, sweep the bar down in an arc to your thighs, exhaling.',
        'Squeeze the lats hard at the bottom for a one-count.',
        'Let the bar rise back overhead under control, feeling the lats stretch.'
      ], [
        'No biceps involved — if your arms bend during the pull, lighten the stack.'
      ]),

    E('dumbbell_row', 'Dumbbell Row', ['one arm row', 'single arm dumbbell row', 'db row'],
      ['lats'], ['upper_back', 'biceps', 'rear_delts', 'forearms'], 'dumbbell', 'pull', 'compound', 'beginner', [
        'Place your left knee and hand on a bench, right foot on the floor, back flat and parallel to the ground.',
        'Let the dumbbell hang from your right hand with the shoulder blade stretched forward.',
        'Row the bell to your hip, driving the elbow back and up close to your body, exhaling.',
        'Lower under control to the full stretch; finish the set, then switch sides.'
      ], [
        'Row to the hip for lats, to the ribs for upper back — pick one and be consistent.',
        'Keep the torso still; the twist-and-heave adds weight but removes back work.'
      ]),

    E('dumbbell_pullover', 'Dumbbell Pullover', ['pullover', 'lying pullover'],
      ['lats'], ['chest', 'triceps'], 'dumbbell', 'pull', 'isolation', 'intermediate', [
        'Lie across or along a bench holding one dumbbell with both palms under the top plate, arms over your chest.',
        'With a slight fixed elbow bend, lower the bell in an arc behind your head, inhaling deep.',
        'Stop when you feel a strong stretch through the lats and ribs.',
        'Pull the bell back over your chest along the same arc, exhaling as the lats contract.'
      ], [
        'Keep hips slightly low to accentuate the stretch, and do not let the elbow angle open on the way back.'
      ]),

    E('machine_pullover', 'Machine Pullover', ['pullover machine', 'nautilus pullover'],
      ['lats'], ['chest', 'triceps', 'abs'], 'machine', 'pull', 'isolation', 'beginner', [
        'Adjust the seat so your shoulders align with the machine pivot, and secure the belt if present.',
        'Place your elbows on the pads and start from the overhead stretch position.',
        'Drive your elbows down in an arc toward your hips, exhaling and squeezing the lats.',
        'Return under control to the overhead stretch without letting the stack pull you out of the seat.'
      ], [
        'One of the only machines that trains the lats through a full stretch-to-contraction arc — use all of it.'
      ]),

    E('meadows_row', 'Meadows Row', ['landmine one arm row'],
      ['lats'], ['upper_back', 'rear_delts', 'biceps', 'forearms'], 'barbell', 'pull', 'compound', 'advanced', [
        'Stand perpendicular to a landmine bar, feet staggered, and grip the sleeve end with an overhand grip.',
        'Hinge with a flat back, bracing your free forearm on your lead thigh.',
        'Row the sleeve up and back, elbow flaring out about 45 degrees, exhaling.',
        'Lower to a full stretch, letting the shoulder blade slide forward at the bottom.'
      ], [
        'The thick sleeve hammers your grip — use a strap so the lats, not your fingers, end the set.'
      ]),

    /* ===== UPPER BACK ===== */

    E('barbell_row', 'Barbell Row', ['bent over row', 'bent-over barbell row', 'bb row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts', 'lower_back', 'forearms'], 'barbell', 'pull', 'compound', 'intermediate', [
        'Hinge at the hips until your torso is 30-45 degrees from horizontal, bar hanging at shin-to-knee level.',
        'Grip just outside your legs, flatten your back, and brace hard.',
        'Row the bar to your lower ribs, driving the elbows up and back, exhaling.',
        'Lower under control to full arm extension without letting your torso rise.'
      ], [
        'Pick a torso angle and keep it — every degree you stand up is weight your legs lift, not your back.',
        'Touch the same shirt spot every rep for consistent lines of pull.'
      ]),

    E('pendlay_row', 'Pendlay Row', ['dead stop row', 'strict barbell row'],
      ['upper_back'], ['lats', 'biceps', 'lower_back', 'rear_delts'], 'barbell', 'pull', 'compound', 'advanced', [
        'Set up over the bar with your torso parallel to the floor, gripping just outside your legs.',
        'From a dead stop on the floor, brace and explosively row the bar to your lower chest.',
        'Exhale as the bar touches, then lower it all the way back to the floor.',
        'Reset your flat back position between every rep — each rep starts from zero.'
      ], [
        'The floor reset removes stretch reflex — go lighter than your touch-and-go row and stay strict.'
      ]),

    E('seated_cable_row', 'Seated Cable Row', ['cable row', 'low row', 'seated row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts', 'lower_back'], 'cable', 'pull', 'compound', 'beginner', [
        'Sit at the row station with feet braced, knees soft, holding the V-handle with arms extended.',
        'Sit tall with a proud chest — torso vertical, not reclined.',
        'Pull the handle to your stomach, driving the elbows back and squeezing the blades together, exhaling.',
        'Return under control, letting your shoulder blades glide forward at the stretch.'
      ], [
        'A small hinge forward at the stretch and upright finish is fine; rocking your whole torso is not.',
        'Lead the pull with your shoulder blades, then the elbows follow.'
      ]),

    E('t_bar_row', 'T-Bar Row', ['t bar row', 'landmine row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts', 'lower_back'], 'barbell', 'pull', 'compound', 'intermediate', [
        'Straddle the bar, hinge to about 45 degrees with a flat back, and grip the handles under the plates.',
        'Brace, then row the plates to your chest, driving elbows up and back.',
        'Exhale at the top and squeeze the mid-back for a one-count.',
        'Lower under control to a full stretch without dropping your chest.'
      ], [
        'Use 25s instead of 45s to extend the range of motion at the top.'
      ]),

    E('chest_supported_row', 'Chest-Supported Dumbbell Row', ['incline dumbbell row', 'prone row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts'], 'dumbbell', 'pull', 'compound', 'beginner', [
        'Lie chest-down on an incline bench with a dumbbell hanging from each hand.',
        'Row both bells to your hips, driving the elbows up and back, exhaling.',
        'Squeeze the shoulder blades together at the top for a one-count.',
        'Lower to a full stretch, letting the blades protract at the bottom.'
      ], [
        'With the torso pinned, there is no cheating — this is the row that keeps lower backs fresh.'
      ]),

    E('machine_row', 'Machine Row', ['seated machine row', 'plate loaded row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts'], 'machine', 'pull', 'compound', 'beginner', [
        'Set the seat so the handles are at chest height and press your chest into the pad.',
        'Grip the handles and pull them toward your torso, elbows tracking close, exhaling.',
        'Squeeze the shoulder blades together at the end of the pull.',
        'Return under control to a full stretch without letting the chest leave the pad.'
      ], [
        'Chest stays glued to the pad — pushing off it to finish reps means the weight is too heavy.'
      ]),

    E('machine_high_row', 'Machine High Row', ['high row', 'plate loaded high row'],
      ['upper_back'], ['lats', 'rear_delts', 'biceps'], 'machine', 'pull', 'compound', 'beginner', [
        'Sit facing the machine with your chest on the pad and grip the high handles overhead-forward.',
        'Pull the handles down and back toward your upper chest, elbows sweeping wide, exhaling.',
        'Squeeze the mid-back and rear delts at the finish.',
        'Return under control until your arms and shoulder blades reach a full stretch.'
      ], [
        'A hybrid of pulldown and row — great for hitting the upper back through a long arc.'
      ]),

    E('inverted_row', 'Inverted Row', ['bodyweight row', 'australian pull-up', 'bar row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts', 'abs'], 'bodyweight', 'pull', 'compound', 'beginner', [
        'Set a bar at waist height, lie beneath it, and grip slightly wider than shoulders.',
        'Form a rigid line from heels to head, hips locked with your glutes.',
        'Pull your chest to the bar, driving elbows down and back, exhaling.',
        'Lower under control to straight arms without letting the hips sag.'
      ], [
        'Raise the bar to make it easier, prop your feet up to make it harder — same plank rules as a push-up.'
      ]),

    E('seal_row', 'Seal Row', ['bench supported barbell row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts'], 'barbell', 'pull', 'compound', 'advanced', [
        'Lie face-down on an elevated flat bench with a barbell resting on the floor beneath you.',
        'Grip the bar at shoulder width with arms fully extended.',
        'Row the bar up until it touches the underside of the bench, exhaling hard.',
        'Lower to a dead hang — every rep starts from a total dead stop.'
      ], [
        'The strictest row that exists; whatever you seal row is your honest rowing strength.'
      ]),

    E('smith_row', 'Smith Machine Row', ['smith bent over row'],
      ['upper_back'], ['lats', 'biceps', 'lower_back'], 'smith', 'pull', 'compound', 'beginner', [
        'Set the smith bar to mid-shin height and hinge over it with a flat back.',
        'Grip just outside your legs and unhook the bar.',
        'Row to your lower ribs along the fixed path, exhaling at the top.',
        'Lower under control, keeping your hinge angle fixed throughout.'
      ], [
        'The fixed bar path lets you focus purely on the squeeze — hold each top position for a beat.'
      ]),

    E('band_row', 'Band Row', ['seated band row', 'banded row'],
      ['upper_back'], ['lats', 'biceps', 'rear_delts'], 'band', 'pull', 'compound', 'beginner', [
        'Sit with legs extended, loop a band around your feet, and hold an end in each hand.',
        'Sit tall with arms extended and slight tension on the band.',
        'Row your hands to your ribs, driving elbows back and squeezing the blades, exhaling.',
        'Return under control, resisting the band all the way out.'
      ], [
        'Pause hard at the chest — band resistance peaks exactly where rows should be squeezed.'
      ]),

    E('gorilla_row', 'Gorilla Row', ['kettlebell alternating row'],
      ['upper_back'], ['lats', 'biceps', 'obliques', 'lower_back'], 'kettlebell', 'pull', 'compound', 'intermediate', [
        'Place two kettlebells between your feet and hinge over them with a flat back, gripping both handles.',
        'Keeping your hips square, row one bell to your hip while pushing the other into the floor.',
        'Lower it under control, then row the other side, exhaling on each pull.',
        'Alternate sides while your torso stays parallel and motionless.'
      ], [
        'Pushing down on the resting bell keeps you honest — the torso should never twist.'
      ]),

    /* ===== LOWER BACK ===== */

    E('deadlift', 'Deadlift', ['conventional deadlift', 'barbell deadlift'],
      ['glutes', 'hamstrings', 'lower_back'], ['quads', 'traps', 'forearms', 'lats'], 'barbell', 'pull', 'compound', 'intermediate', [
        'Stand with mid-foot under the bar, feet hip width, and grip just outside your legs.',
        'Bend to the bar by pushing your hips back, flatten your back, and pull the slack out of the bar.',
        'Take a big breath, brace, and drive the floor away — bar dragging up your shins.',
        'Lock out by squeezing your glutes tall, then return the bar to the floor along the same path.'
      ], [
        'The bar stays in contact with your legs the entire lift — daylight between them is leaked force.',
        'Reset your brace on the floor every rep; do not bounce.'
      ]),

    E('back_extension', 'Back Extension', ['hyperextension', '45 degree back extension'],
      ['lower_back'], ['glutes', 'hamstrings'], 'other', 'legs', 'isolation', 'beginner', [
        'Set the hyperextension pad at the crease of your hips and hook your heels under the rollers.',
        'Cross your arms over your chest and lower your torso until you feel a hamstring stretch.',
        'Raise your torso until your body forms a straight line, exhaling — no hyperextending past neutral.',
        'Pause for a one-count and lower under control.'
      ], [
        'To bias the glutes, round the upper back slightly and squeeze the glutes to lift; for spinal erectors, keep the back flat.',
        'Hold a plate to your chest to progress.'
      ]),

    E('machine_back_extension', 'Machine Back Extension', ['seated back extension'],
      ['lower_back'], ['glutes'], 'machine', 'legs', 'isolation', 'beginner', [
        'Set the seat so the pad rests across your upper back and secure your feet.',
        'Cross your arms and press back against the pad, extending your spine, exhaling.',
        'Move through a comfortable range — full extension without lurching.',
        'Return under control until your torso folds slightly forward.'
      ], [
        'Slow and smooth wins here; jerky reps on a loaded spine help nothing.'
      ]),

    E('superman', 'Superman', ['superman hold', 'prone back extension'],
      ['lower_back'], ['glutes', 'upper_back'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Lie face-down with arms extended overhead and legs straight.',
        'Simultaneously lift your arms, chest, and legs a few inches off the floor, exhaling.',
        'Hold for two to five seconds, squeezing your glutes and lower back.',
        'Lower everything slowly and repeat without slamming down.'
      ], [
        'Height is not the goal — a small, controlled lift with a long body beats a violent arch.'
      ]),

    E('bird_dog', 'Bird Dog', ['quadruped arm and leg raise'],
      ['lower_back'], ['glutes', 'abs', 'obliques'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Start on hands and knees, wrists under shoulders, knees under hips, spine neutral.',
        'Reach your right arm forward and left leg back until both are level with your torso.',
        'Hold for a breath without letting your hips tilt or your back arch.',
        'Return slowly and switch sides, moving as if balancing a cup of water on your back.'
      ], [
        'The exercise is anti-movement: if your hips wobble as the limbs move, slow down.'
      ]),

    E('good_morning', 'Good Morning', ['barbell good morning'],
      ['hamstrings', 'lower_back'], ['glutes'], 'barbell', 'legs', 'compound', 'advanced', [
        'Set a barbell across your upper back as if squatting, feet hip width, knees soft.',
        'Brace, then push your hips straight back, letting your torso hinge toward horizontal.',
        'Stop when your hamstrings are fully stretched — usually torso 45 degrees or lower.',
        'Drive your hips forward to stand tall, exhaling, squeezing the glutes at the top.'
      ], [
        'Start embarrassingly light — the lever arm on your spine is enormous.',
        'It is a hip hinge, not a bow: hips travel backward, spine never rounds.'
      ]),

    E('reverse_hyperextension', 'Reverse Hyperextension', ['reverse hyper'],
      ['glutes', 'lower_back'], ['hamstrings'], 'machine', 'legs', 'isolation', 'intermediate', [
        'Lie face-down on the reverse hyper pad with your hips at its edge, gripping the handles.',
        'With legs hanging, hook your ankles in the strap or hold legs straight.',
        'Swing your legs up behind you until they are level with your torso, exhaling and squeezing the glutes.',
        'Lower under control, letting the legs swing slightly under the pad for a stretch.'
      ], [
        'Lift with the glutes, not by yanking the lower back into extension — stop at horizontal.'
      ]),

    E('jefferson_curl', 'Jefferson Curl', ['weighted spinal roll'],
      ['lower_back'], ['hamstrings', 'glutes'], 'dumbbell', 'legs', 'isolation', 'advanced', [
        'Stand on a low box holding a light dumbbell, feet together, legs straight but not locked.',
        'Tuck your chin and roll down one vertebra at a time, letting the weight hang toward your toes.',
        'Reach maximal comfortable depth with a fully rounded spine, breathing calmly.',
        'Reverse the motion, stacking the spine from tailbone to head.'
      ], [
        'This deliberately loads spinal flexion — treat it as mobility work with a tiny weight, never a strength lift.'
      ]),

    /* ===== BICEPS ===== */

    E('barbell_curl', 'Barbell Curl', ['bb curl', 'standing barbell curl'],
      ['biceps'], ['forearms'], 'barbell', 'pull', 'isolation', 'beginner', [
        'Stand tall holding a barbell at your thighs with an underhand, shoulder-width grip.',
        'Pin your elbows to your sides and curl the bar to shoulder height, exhaling.',
        'Squeeze the biceps hard at the top for a one-count.',
        'Lower under control for a slow two-count until your arms are fully straight.'
      ], [
        'Elbows glued to your ribs — the moment they drift forward, the front delts take over.',
        'Full extension at the bottom every rep; half-curls build half-biceps.'
      ]),

    E('ez_bar_curl', 'EZ Bar Curl', ['ez curl'],
      ['biceps'], ['forearms'], 'ez_bar', 'pull', 'isolation', 'beginner', [
        'Grip the angled sections of an EZ bar at shoulder width, palms angled slightly in.',
        'With elbows pinned to your sides, curl the bar to shoulder height, exhaling.',
        'Squeeze at the top, then lower under control to full extension.',
        'Keep your torso still — no rocking to start the rep.'
      ], [
        'The semi-supinated grip spares the wrists — the default curl for anyone with wrist aches.'
      ]),

    E('dumbbell_curl', 'Dumbbell Curl', ['alternating dumbbell curl', 'db curl', 'bicep curl'],
      ['biceps'], ['forearms'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Stand with dumbbells at your sides, palms facing your thighs.',
        'Curl one bell up, rotating your palm to face the shoulder as it rises, exhaling.',
        'Squeeze at the top, lower under control, and repeat with the other arm.',
        'Keep the elbows pinned at your sides and the torso quiet throughout.'
      ], [
        'The supination (palm turn) is half the exercise — finish each rep with the pinky higher than the thumb.'
      ]),

    E('hammer_curl', 'Hammer Curl', ['neutral grip curl', 'db hammer curl'],
      ['biceps'], ['forearms'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Hold dumbbells at your sides with palms facing each other, thumbs up.',
        'Curl both bells to your shoulders keeping the neutral grip the whole way, exhaling.',
        'Pause at the top, then lower under control to full extension.',
        'Keep elbows at your sides — no swinging the bells up.'
      ], [
        'The neutral grip hits the brachialis and forearms — it thickens the arm rather than peaking it.'
      ]),

    E('incline_dumbbell_curl', 'Incline Dumbbell Curl', ['incline curl'],
      ['biceps'], ['forearms'], 'dumbbell', 'pull', 'isolation', 'intermediate', [
        'Set a bench to about 45-60 degrees and sit back with dumbbells hanging at your sides.',
        'Let your arms hang behind your torso — this is the stretched start position.',
        'Curl both bells up without letting the elbows drift forward, exhaling.',
        'Lower slowly to the full hang, feeling the stretch through the long head.'
      ], [
        'The stretch position is the point — go lighter than standing curls and never cut the bottom range.'
      ]),

    E('preacher_curl', 'Preacher Curl', ['ez bar preacher curl', 'scott curl'],
      ['biceps'], ['forearms'], 'ez_bar', 'pull', 'isolation', 'beginner', [
        'Sit at a preacher bench with your armpits over the top of the pad, holding an EZ bar underhand.',
        'Start from fully extended arms resting on the pad.',
        'Curl the bar up until your forearms are vertical, exhaling.',
        'Lower under strict control to full extension — the pad exposes any bounce.'
      ], [
        'Do not open the elbows at the bottom quickly; the stretched position under load is where preachers bite.'
      ]),

    E('dumbbell_preacher_curl', 'Dumbbell Preacher Curl', ['single arm preacher curl'],
      ['biceps'], ['forearms'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Rest the back of one upper arm on the preacher pad, holding a dumbbell underhand at full extension.',
        'Curl the bell up until your forearm is vertical, exhaling.',
        'Squeeze for a one-count at the top.',
        'Lower slowly to a full stretch; finish the set, then switch arms.'
      ], [
        'One arm at a time reveals and fixes strength imbalances the bar version hides.'
      ]),

    E('concentration_curl', 'Concentration Curl', ['seated concentration curl'],
      ['biceps'], ['forearms'], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Sit on a bench, lean forward, and brace your right elbow against the inside of your right thigh.',
        'Let the dumbbell hang at full extension.',
        'Curl the bell toward your shoulder without moving the upper arm, exhaling.',
        'Squeeze hard at the top, lower slowly, and switch arms after the set.'
      ], [
        'The thigh brace makes cheating impossible — chase the squeeze, not the load.'
      ]),

    E('cable_curl', 'Cable Curl', ['bar cable curl', 'low pulley curl'],
      ['biceps'], ['forearms'], 'cable', 'pull', 'isolation', 'beginner', [
        'Attach a straight or EZ bar to a low pulley and grip it underhand at shoulder width.',
        'Stand tall a step back from the stack, elbows pinned to your sides.',
        'Curl the bar to shoulder height, exhaling, and squeeze for a one-count.',
        'Lower under control — the cable keeps tension even at full extension.'
      ], [
        'Unlike dumbbells, there is no rest at the bottom — expect the same weight to feel harder.'
      ]),

    E('rope_hammer_curl', 'Rope Hammer Curl', ['cable hammer curl'],
      ['biceps'], ['forearms'], 'cable', 'pull', 'isolation', 'beginner', [
        'Attach a rope to a low pulley and grip an end in each hand, palms facing each other.',
        'With elbows pinned, curl the rope up, keeping the neutral grip, exhaling.',
        'At the top, pull the rope ends slightly apart for a harder squeeze.',
        'Lower under control to full extension.'
      ], [
        'Constant cable tension plus neutral grip makes this the elbow-friendliest curl in the gym.'
      ]),

    E('spider_curl', 'Spider Curl', ['prone incline curl'],
      ['biceps'], ['forearms'], 'dumbbell', 'pull', 'isolation', 'intermediate', [
        'Lie chest-down on an incline bench with your arms hanging straight beneath your shoulders, dumbbells in hand.',
        'Curl both bells up without letting the upper arms swing, exhaling.',
        'Squeeze hard at the top — this position maximizes the peak contraction.',
        'Lower slowly to a dead hang.'
      ], [
        'The opposite of the incline curl: shortest muscle length at the top — pair them for full-range biceps work.'
      ]),

    E('machine_curl', 'Machine Bicep Curl', ['machine preacher curl', 'curl machine'],
      ['biceps'], ['forearms'], 'machine', 'pull', 'isolation', 'beginner', [
        'Adjust the seat so your armpits sit over the pad and your elbows align with the pivot.',
        'Grip the handles at full arm extension.',
        'Curl to full contraction, exhaling, and hold the squeeze for a one-count.',
        'Lower under control without letting the stack touch down between reps.'
      ], [
        'Perfect for drop sets — pull the pin, drop the weight, and keep curling.'
      ]),

    E('band_curl', 'Band Curl', ['banded bicep curl'],
      ['biceps'], ['forearms'], 'band', 'pull', 'isolation', 'beginner', [
        'Stand on the middle of a band and hold an end in each hand, palms forward.',
        'With elbows pinned to your sides, curl your hands to your shoulders, exhaling.',
        'Fight the band on the way down for a slow two-count.',
        'Adjust difficulty by widening your stance on the band.'
      ], [
        'Bands are hardest at the top — pause there to attack the peak contraction dumbbells miss.'
      ]),

    E('zottman_curl', 'Zottman Curl', ['rotating curl'],
      ['biceps', 'forearms'], [], 'dumbbell', 'pull', 'isolation', 'intermediate', [
        'Stand with dumbbells at your sides, palms facing forward.',
        'Curl both bells to your shoulders with a standard underhand grip, exhaling.',
        'At the top, rotate your palms to face down.',
        'Lower slowly with the overhand grip, then rotate back to palms-up at the bottom.'
      ], [
        'Curl up with the biceps, lower with the forearms — the slow pronated negative is the money.'
      ]),

    E('drag_curl', 'Drag Curl', ['barbell drag curl'],
      ['biceps'], ['forearms', 'rear_delts'], 'barbell', 'pull', 'isolation', 'intermediate', [
        'Hold a barbell at your thighs with an underhand, shoulder-width grip.',
        'Curl by dragging the bar straight up your torso, driving your elbows back behind you.',
        'Stop when the bar reaches your lower chest, exhaling, and squeeze.',
        'Lower by dragging the bar back down your body under control.'
      ], [
        'The bar never leaves your torso — no arc, no front delt, all biceps.'
      ]),

    /* ===== TRICEPS ===== */

    E('close_grip_bench_press', 'Close-Grip Bench Press', ['CGBP', 'close grip bench'],
      ['triceps'], ['chest', 'front_delts'], 'barbell', 'push', 'compound', 'intermediate', [
        'Lie on a bench and grip the bar at about shoulder width — not narrower.',
        'Unrack and hold the bar over your shoulders, shoulder blades pinched.',
        'Lower to your lower chest with elbows tucked close to your sides, inhaling.',
        'Press to lockout, finishing the elbows fully, exhaling through the drive.'
      ], [
        'Shoulder-width is close enough — a very narrow grip only wrecks wrists.',
        'The last third of the press is triceps; own the lockout on every rep.'
      ]),

    E('skullcrusher', 'Skullcrusher', ['skull crusher', 'lying triceps extension', 'french press'],
      ['triceps'], [], 'ez_bar', 'push', 'isolation', 'intermediate', [
        'Lie on a bench holding an EZ bar over your chest with a narrow overhand grip.',
        'Keep the upper arms vertical and angled slightly back toward your head.',
        'Bend only the elbows, lowering the bar to just behind the crown of your head, inhaling.',
        'Extend back to lockout along the same path, exhaling and squeezing the triceps.'
      ], [
        'Lowering behind the head, not to the forehead, keeps constant tension and saves the elbows.',
        'If elbows ache, reduce weight and slow the negative before abandoning the lift.'
      ]),

    E('dumbbell_skullcrusher', 'Dumbbell Skullcrusher', ['lying dumbbell triceps extension'],
      ['triceps'], [], 'dumbbell', 'push', 'isolation', 'intermediate', [
        'Lie on a bench holding a dumbbell in each hand above your chest, palms facing each other.',
        'With upper arms fixed and tilted slightly back, bend the elbows to lower the bells beside your ears.',
        'Inhale on the way down and feel the long-head stretch.',
        'Extend back to lockout, exhaling, without letting the elbows flare.'
      ], [
        'The neutral grip lets the bells travel past your head for a deeper stretch than a bar allows.'
      ]),

    E('overhead_dumbbell_extension', 'Overhead Dumbbell Extension', ['seated triceps extension', 'french press seated', 'two-hand overhead extension'],
      ['triceps'], [], 'dumbbell', 'push', 'isolation', 'beginner', [
        'Sit tall holding one dumbbell overhead with both palms under the top plate.',
        'Keep your elbows close to your ears, pointing forward.',
        'Lower the bell behind your head until you feel a deep triceps stretch, inhaling.',
        'Extend back to lockout overhead, exhaling — upper arms stay vertical throughout.'
      ], [
        'The overhead position stretches the long head fully — the growth spot most pushdowns miss.',
        'Keep the ribs down; do not arch your back to fake range.'
      ]),

    E('cable_overhead_extension', 'Cable Overhead Extension', ['rope overhead extension', 'overhead rope extension'],
      ['triceps'], [], 'cable', 'push', 'isolation', 'intermediate', [
        'Attach a rope to a low pulley, face away, and hold the ends behind your head, elbows up.',
        'Stagger your stance and lean slightly forward for balance.',
        'Extend your arms overhead until locked out, splitting the rope ends apart, exhaling.',
        'Lower under control until your forearms touch your biceps.'
      ], [
        'Cables keep tension in the stretched position where dumbbells go light — go slow there.'
      ]),

    E('triceps_pushdown', 'Triceps Pushdown', ['rope pushdown', 'cable pushdown', 'tricep pushdown'],
      ['triceps'], [], 'cable', 'push', 'isolation', 'beginner', [
        'Attach a rope to a high pulley and grip an end in each hand, elbows pinned to your sides.',
        'Start with forearms just above parallel to the floor.',
        'Push down to full lockout, splitting the rope ends apart at the bottom, exhaling.',
        'Return under control until the forearms pass parallel — elbows never move.'
      ], [
        'Elbows are hinges bolted to your ribs; if they drift forward, the lats and chest are pushing.',
        'Squeeze the lockout for a one-count on every rep.'
      ]),

    E('straight_bar_pushdown', 'Straight-Bar Pushdown', ['bar pushdown', 'v-bar pushdown'],
      ['triceps'], [], 'cable', 'push', 'isolation', 'beginner', [
        'Attach a straight or V bar to a high pulley and take an overhand grip, elbows at your sides.',
        'Push the bar down to full lockout against your thighs, exhaling.',
        'Hold the contraction for a one-count.',
        'Let the bar rise under control until your forearms pass parallel.'
      ], [
        'The bar allows more load than the rope — use it for heavier, lower-rep pushdown work.'
      ]),

    E('single_arm_pushdown', 'Single-Arm Cable Pushdown', ['one arm pushdown', 'reverse grip pushdown'],
      ['triceps'], [], 'cable', 'push', 'isolation', 'beginner', [
        'Grip a D-handle on a high pulley with one hand, elbow pinned to your side.',
        'Push down to full lockout, exhaling, keeping the wrist neutral.',
        'Pause at the bottom, then return under control past parallel.',
        'Complete all reps, then switch arms; try both overhand and underhand grips.'
      ], [
        'The underhand grip biases the medial head and keeps the elbow tracking honestly.'
      ]),

    E('dip', 'Dip', ['dips', 'parallel bar dip', 'triceps dip'],
      ['triceps'], ['chest', 'front_delts'], 'bodyweight', 'push', 'compound', 'intermediate', [
        'Support yourself on parallel bars with arms locked and body upright.',
        'Lower by bending the elbows, keeping your torso as vertical as possible.',
        'Descend until your upper arms are parallel to the floor, inhaling.',
        'Press back to lockout, exhaling — the vertical torso keeps the triceps doing the work.'
      ], [
        'Upright torso = triceps, forward lean = chest; choose deliberately.',
        'Add weight with a belt once 12 strict reps are easy.'
      ]),

    E('bench_dip', 'Bench Dip', ['tricep bench dip', 'bench dips'],
      ['triceps'], ['chest', 'front_delts'], 'bodyweight', 'push', 'compound', 'beginner', [
        'Sit on the edge of a bench, hands beside your hips, and walk your feet forward off the seat.',
        'Slide your hips just clear of the bench, supporting yourself on straight arms.',
        'Bend the elbows straight back to lower your hips toward the floor, inhaling.',
        'Press back to lockout, exhaling; elevate your feet to progress.'
      ], [
        'Keep hips close to the bench and shoulders away from your ears — drifting forward strains the shoulder.'
      ]),

    E('diamond_push_up', 'Diamond Push-Up', ['close grip push-up', 'triangle push-up'],
      ['triceps'], ['chest', 'front_delts', 'abs'], 'bodyweight', 'push', 'compound', 'intermediate', [
        'Set up in a push-up position with your hands together under your chest, thumbs and index fingers forming a diamond.',
        'Brace a straight line from heels to head.',
        'Lower your chest to your hands with elbows tracking back along your ribs, inhaling.',
        'Press to full lockout, exhaling and finishing the elbows completely.'
      ], [
        'If wrists complain, separate the hands a few inches — shoulder-width close-grip works the same.'
      ]),

    E('dumbbell_kickback', 'Dumbbell Kickback', ['tricep kickback', 'kickback'],
      ['triceps'], ['rear_delts'], 'dumbbell', 'push', 'isolation', 'beginner', [
        'Hinge forward with a flat back, brace one hand on a bench, dumbbell in the other hand.',
        'Raise your upper arm until it is parallel to the floor and pin it there.',
        'Extend the elbow until your arm is straight behind you, exhaling and squeezing.',
        'Return under control to a 90-degree elbow without dropping the upper arm.'
      ], [
        'This only works at full lockout — the top inch with a hard squeeze is the entire exercise.'
      ]),

    E('cable_kickback', 'Cable Kickback', ['cable tricep kickback'],
      ['triceps'], ['rear_delts'], 'cable', 'push', 'isolation', 'intermediate', [
        'Set a pulley to the low position, grip the cable ball or a handle, and hinge forward with a flat back.',
        'Pin your upper arm parallel to the floor along your side.',
        'Extend to full lockout behind you, exhaling and holding the squeeze.',
        'Return under control; the cable keeps tension where the dumbbell version goes slack.'
      ], [
        'Skip the handle and grip the cable end directly for a more natural wrist position.'
      ]),

    E('machine_triceps_extension', 'Machine Triceps Extension', ['triceps extension machine', 'machine dip'],
      ['triceps'], ['chest'], 'machine', 'push', 'isolation', 'beginner', [
        'Adjust the seat so your elbows align with the machine pivot and grip the handles.',
        'Press to full elbow extension, exhaling and squeezing at lockout.',
        'Return under control to a full stretch without the stack touching down.',
        'Keep your back against the pad and elbows tracking the machine path.'
      ], [
        'A safe place to take triceps to true failure — no bar to drop on yourself.'
      ]),

    E('jm_press', 'JM Press', ['jm bench press'],
      ['triceps'], ['chest', 'front_delts'], 'barbell', 'push', 'compound', 'advanced', [
        'Lie on a bench gripping the bar at shoulder width, arms locked over your upper chest.',
        'Lower the bar toward your chin-neck area by breaking at the elbows and letting them drift slightly forward.',
        'Stop when the bar is a few inches above you, forearms folded onto biceps.',
        'Punch back up to lockout along the same path, exhaling.'
      ], [
        'A hybrid of close-grip bench and skullcrusher — learn it light; the bar path feels strange at first.'
      ]),

    E('band_pushdown', 'Band Pushdown', ['banded tricep pushdown'],
      ['triceps'], [], 'band', 'push', 'isolation', 'beginner', [
        'Loop a band over a pull-up bar or high anchor and grip it with both hands, elbows at your sides.',
        'Push down to full lockout, exhaling and squeezing the triceps.',
        'Return under control until your forearms pass parallel.',
        'Keep the elbows pinned — only the forearms move.'
      ], [
        'Great high-rep finisher and warm-up — do a set of 20-30 before any pressing session.'
      ]),

    /* ===== FOREARMS ===== */

    E('barbell_wrist_curl', 'Barbell Wrist Curl', ['wrist curl'],
      ['forearms'], [], 'barbell', 'pull', 'isolation', 'beginner', [
        'Sit with your forearms resting on your thighs or a bench, palms up, wrists hanging over the edge.',
        'Let the bar roll down to your fingertips for a full stretch.',
        'Curl the wrists up as high as possible, exhaling, and squeeze.',
        'Lower slowly back to the fingertip stretch.'
      ], [
        'The finger-roll at the bottom doubles the range — do not skip it.'
      ]),

    E('barbell_reverse_wrist_curl', 'Reverse Wrist Curl', ['wrist extension', 'overhand wrist curl'],
      ['forearms'], [], 'barbell', 'pull', 'isolation', 'beginner', [
        'Sit with forearms on your thighs, palms down, wrists hanging over your knees holding a light bar.',
        'Let your wrists flex down toward the floor.',
        'Extend the wrists to raise the bar as high as possible, exhaling.',
        'Lower under control; use a fraction of your wrist-curl weight.'
      ], [
        'Wrist extensors are weak and neglected — training them balances the forearm and calms elbow pain.'
      ]),

    E('dumbbell_wrist_curl', 'Dumbbell Wrist Curl', ['single arm wrist curl'],
      ['forearms'], [], 'dumbbell', 'pull', 'isolation', 'beginner', [
        'Sit and rest one forearm on your thigh, palm up, wrist past your knee, dumbbell in hand.',
        'Lower the bell by opening your fingers slightly for a full stretch.',
        'Curl the wrist up, exhaling, and squeeze at the top.',
        'Complete the set, then switch arms; add reps before adding weight.'
      ], [
        'One arm at a time lets your free hand brace the forearm so it cannot lift off the thigh.'
      ]),

    E('reverse_curl', 'Reverse Curl', ['overhand curl', 'ez bar reverse curl', 'pronated curl'],
      ['forearms'], ['biceps'], 'ez_bar', 'pull', 'isolation', 'beginner', [
        'Hold an EZ bar with an overhand grip at shoulder width, arms extended at your thighs.',
        'With elbows pinned to your sides, curl the bar to shoulder height, exhaling.',
        'Keep the wrists dead straight — no flicking up at the top.',
        'Lower under control to full extension.'
      ], [
        'Expect to use about two-thirds of your normal curl weight; the brachioradialis is the driver here.'
      ]),

    E('dead_hang', 'Dead Hang', ['bar hang', 'passive hang'],
      ['forearms'], ['lats', 'abs'], 'bodyweight', 'pull', 'isolation', 'beginner', [
        'Grip a pull-up bar with both hands shoulder width, palms forward.',
        'Hang with straight arms, feet off the floor, shoulders relaxed or lightly packed.',
        'Breathe steadily and hold for time — start with 20-30 seconds.',
        'Step off (do not drop) when your grip approaches failure.'
      ], [
        'Doubles as grip training and shoulder decompression — accumulate 60-90 seconds daily.'
      ]),

    E('plate_pinch', 'Plate Pinch', ['pinch grip hold'],
      ['forearms'], [], 'other', 'pull', 'isolation', 'beginner', [
        'Stand two smooth plates together, smooth sides out, and pinch them between your fingers and thumb.',
        'Deadlift them to your side with a flat back and stand tall.',
        'Hold for time, gripping hard so the plates cannot slide.',
        'Set them down under control before your grip fails completely.'
      ], [
        'Thumb strength is trained almost nowhere else — start with two 5 kg plates per hand.'
      ]),

    E('wrist_roller', 'Wrist Roller', ['forearm roller'],
      ['forearms'], ['front_delts', 'side_delts'], 'other', 'pull', 'isolation', 'intermediate', [
        'Hold a wrist roller with both hands at shoulder height, arms extended, a light plate hanging from its cord.',
        'Roll the handle hand-over-hand to wind the cord and raise the plate to the top.',
        'Reverse direction, lowering the plate under control by unrolling.',
        'One up-and-down cycle is one rep; keep the arms level throughout.'
      ], [
        'The lowering half burns most — resist the urge to let the cord spin free.'
      ]),

    E('hand_gripper', 'Hand Gripper', ['grip crusher', 'grippers'],
      ['forearms'], [], 'other', 'pull', 'isolation', 'beginner', [
        'Seat the gripper diagonally in your palm with the lower handle locked against the heel of your hand.',
        'Squeeze until the handles touch, exhaling.',
        'Hold the closed position for a one-count.',
        'Open under control — do not let the spring snap your fingers open.'
      ], [
        'Treat it like any lift: sets, reps, progression to harder grippers — not mindless squeezing all day.'
      ]),

    /* ===== ABS ===== */

    E('plank', 'Plank', ['front plank', 'forearm plank'],
      ['abs'], ['obliques', 'glutes', 'front_delts'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Set your forearms on the floor, elbows under shoulders, and step your feet back into a straight line.',
        'Squeeze your glutes and tuck your ribs down toward your pelvis — no sagging or piking.',
        'Breathe steadily behind the brace; do not hold your breath.',
        'Hold for the target time, ending the set the moment your hips drop.'
      ], [
        'A hard 30-second plank with everything squeezed beats a saggy 3-minute one.',
        'Progress by lifting a foot or reaching an arm forward, not just adding time.'
      ]),

    E('crunch', 'Crunch', ['floor crunch', 'ab crunch'],
      ['abs'], [], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Lie on your back, knees bent, feet flat, fingertips lightly behind your ears.',
        'Exhale and curl your ribs toward your pelvis, lifting the shoulder blades off the floor.',
        'Pause at the top with your abs fully shortened — this is a short movement.',
        'Lower slowly until your shoulder blades touch down, inhaling.'
      ], [
        'It is a rib-to-pelvis curl, not a sit-up — the lower back stays on the floor.',
        'Never yank your neck; the hands are decoration, not levers.'
      ]),

    E('sit_up', 'Sit-Up', ['situp', 'full sit-up'],
      ['abs'], ['obliques', 'quads'], 'bodyweight', 'core', 'compound', 'beginner', [
        'Lie on your back with knees bent, feet anchored or free, arms crossed over your chest.',
        'Exhale and curl your torso all the way up until your chest nears your thighs.',
        'Keep the movement smooth — curl up, do not jerk.',
        'Lower under control, one vertebra at a time, inhaling.'
      ], [
        'Anchored feet let the hip flexors help — mix in crunches or leg raises for balance.'
      ]),

    E('decline_sit_up', 'Decline Sit-Up', ['decline bench sit-up'],
      ['abs'], ['obliques', 'quads'], 'bodyweight', 'core', 'compound', 'intermediate', [
        'Hook your feet into a decline bench and lie back with arms crossed over your chest.',
        'Exhale and curl your torso up until your chest nears your knees.',
        'Control the descent all the way back to the pad, inhaling.',
        'Hold a plate against your chest to progress.'
      ], [
        'The decline loads the bottom range — do not bounce off the pad at the bottom.'
      ]),

    E('cable_crunch', 'Cable Crunch', ['kneeling cable crunch', 'rope crunch'],
      ['abs'], ['obliques'], 'cable', 'core', 'isolation', 'intermediate', [
        'Kneel below a high pulley holding a rope with both hands beside your head.',
        'Keep your hips still and exhale as you curl your ribs toward your pelvis, elbows driving toward your knees.',
        'Squeeze the abs hard at the bottom for a one-count.',
        'Return under control until your abs reach a full stretch — hips stay back the whole time.'
      ], [
        'If your hips rock forward and back, you are hip-hinging, not crunching — freeze the hips.',
        'This is the easiest ab exercise to progressively overload; treat it like a lift.'
      ]),

    E('machine_crunch', 'Machine Crunch', ['ab crunch machine', 'seated crunch'],
      ['abs'], ['obliques'], 'machine', 'core', 'isolation', 'beginner', [
        'Set the seat so the pads rest on your chest or in your hands and your spine aligns with the pivot.',
        'Exhale and crunch your ribs toward your pelvis against the resistance.',
        'Pause in the fully shortened position for a one-count.',
        'Return under control to a full stretch without the stack slamming.'
      ], [
        'Pick a weight you can pause with — swinging the stack trains nothing.'
      ]),

    E('hanging_knee_raise', 'Hanging Knee Raise', ['knee raise', 'captains chair knee raise'],
      ['abs'], ['obliques', 'forearms'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Hang from a pull-up bar with an overhand grip, body straight and still.',
        'Exhale and pull your knees up toward your chest, letting your pelvis curl under at the top.',
        'Pause when your thighs pass horizontal.',
        'Lower under control to a dead hang without swinging.'
      ], [
        'The pelvic curl at the top is what makes it an ab exercise — knees-to-90 alone is mostly hip flexors.'
      ]),

    E('hanging_leg_raise', 'Hanging Leg Raise', ['straight leg raise', 'hanging raise'],
      ['abs'], ['obliques', 'forearms', 'quads'], 'bodyweight', 'core', 'isolation', 'advanced', [
        'Hang from a bar with straight legs and a quiet, braced body.',
        'Exhale and raise your straight legs until they pass horizontal, curling the pelvis up at the top.',
        'Avoid any swing — the movement starts from stillness every rep.',
        'Lower under strict control back to vertical.'
      ], [
        'Kill the swing by pausing one second at the dead hang between reps.',
        'Bend the knees slightly if your hamstrings cut the range short.'
      ]),

    E('toes_to_bar', 'Toes-to-Bar', ['T2B'],
      ['abs'], ['lats', 'obliques', 'forearms'], 'bodyweight', 'core', 'compound', 'advanced', [
        'Hang from a bar with a shoulder-width grip and engage your lats.',
        'Exhale and fold your body, raising straight legs until your toes touch the bar.',
        'Keep the movement strict — press your hands down as your legs rise.',
        'Lower under control to a full hang without swinging into the next rep.'
      ], [
        'Strict reps only build the midline; kipping cycles are a different (gymnastic) skill.'
      ]),

    E('lying_leg_raise', 'Lying Leg Raise', ['leg raise', 'floor leg raise'],
      ['abs'], ['quads', 'obliques'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Lie on your back, legs straight, hands under your hips or flat at your sides.',
        'Press your lower back into the floor and raise your legs to vertical, exhaling.',
        'Lower the legs slowly toward the floor, stopping the moment your lower back starts to arch.',
        'Raise again from that point — that is your working range.'
      ], [
        'The lower back never leaves the floor; shorten the range rather than let it arch.'
      ]),

    E('reverse_crunch', 'Reverse Crunch', ['lying reverse crunch'],
      ['abs'], ['obliques'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Lie on your back with knees bent at 90 degrees, hands flat at your sides.',
        'Exhale and curl your pelvis up, rolling your knees toward your chest.',
        'Lift your tailbone off the floor with ab strength — not by pushing through your hands.',
        'Lower slowly until your tailbone and lower back settle back down.'
      ], [
        'Slow beats big: a small controlled pelvic curl trains the lower abs; a leg-swing does not.'
      ]),

    E('ab_wheel_rollout', 'Ab Wheel Rollout', ['ab rollout', 'wheel rollout'],
      ['abs'], ['obliques', 'lats', 'front_delts'], 'other', 'core', 'compound', 'intermediate', [
        'Kneel holding the ab wheel under your shoulders, hips slightly tucked, ribs down.',
        'Roll the wheel forward, letting your arms and torso extend while your abs resist the arch.',
        'Go only as far as you can with zero lower-back sag, inhaling on the way out.',
        'Exhale and pull the wheel back by driving your hips and lats together.'
      ], [
        'Range is earned: short controlled rollouts beat long saggy ones every time.',
        'Squeeze your glutes throughout to protect the lower back.'
      ]),

    E('dead_bug', 'Dead Bug', ['deadbug'],
      ['abs'], ['obliques'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Lie on your back with arms pointing at the ceiling and knees bent 90 degrees over your hips.',
        'Press your lower back gently into the floor and keep it there.',
        'Exhale slowly while extending your right arm overhead and left leg out straight, hovering above the floor.',
        'Return and switch sides, moving only as fast as you can keep the back flat.'
      ], [
        'The long exhale is the secret — breathe out fully as the limbs extend and the abs switch on.'
      ]),

    E('v_up', 'V-Up', ['v sit-up', 'jackknife'],
      ['abs'], ['quads', 'obliques'], 'bodyweight', 'core', 'compound', 'intermediate', [
        'Lie flat with arms extended overhead and legs straight.',
        'Exhale and fold in half, lifting your torso and legs together to touch your toes at the top.',
        'Balance briefly on your tailbone in the V position.',
        'Lower both halves under control without letting heels or shoulders rest on the floor.'
      ], [
        'Tuck the knees on the way up if a straight-leg V is out of reach today — same fold, shorter lever.'
      ]),

    E('hollow_body_hold', 'Hollow Body Hold', ['hollow hold'],
      ['abs'], ['quads', 'obliques'], 'bodyweight', 'core', 'isolation', 'intermediate', [
        'Lie on your back and press your lower back into the floor by tucking your pelvis.',
        'Raise your shoulder blades and straight legs off the floor, arms extended by your ears.',
        'Hold the shallow banana shape, breathing shallowly, lower back glued down.',
        'Bend knees or raise the legs higher to reduce difficulty as needed.'
      ], [
        'The floor contact of the lower back is the whole exercise — if it arches, shorten the shape.'
      ]),

    E('dragon_flag', 'Dragon Flag', ['dragonflag'],
      ['abs'], ['obliques', 'lats', 'glutes'], 'bodyweight', 'core', 'compound', 'advanced', [
        'Lie on a bench and grip its edge firmly behind your head.',
        'Curl your entire body up so only your upper back touches the bench, body straight from shoulders to toes.',
        'Lower your rigid body slowly toward the bench, inhaling, without breaking at the hips.',
        'Stop just above the bench and raise back up, exhaling.'
      ], [
        'Master slow negatives first; the body stays one straight plank — piking at the hips is the fail.'
      ]),

    E('mountain_climber', 'Mountain Climber', ['mountain climbers'],
      ['abs'], ['quads', 'front_delts', 'obliques'], 'bodyweight', 'core', 'compound', 'beginner', [
        'Start in a high plank with hands under shoulders and body straight.',
        'Drive one knee toward your chest, then switch legs in a running rhythm.',
        'Keep hips level and low — the plank must not bounce as the legs cycle.',
        'Breathe rhythmically and go for time or total reps.'
      ], [
        'Speed is worthless if the hips pike — slow down until the plank stays perfectly still.'
      ]),

    E('bear_crawl', 'Bear Crawl', ['quadruped crawl'],
      ['abs'], ['front_delts', 'quads', 'obliques'], 'bodyweight', 'core', 'compound', 'beginner', [
        'Start on hands and toes with knees bent and hovering an inch off the floor, back flat.',
        'Crawl forward moving opposite hand and foot together, knees staying low.',
        'Keep hips level with your shoulders — imagine a cup of water on your lower back.',
        'Crawl forward and backward for distance or time, breathing steadily.'
      ], [
        'Small steps keep the hips quiet; big lunging steps turn it into a shoulder shuffle.'
      ]),

    E('l_sit', 'L-Sit', ['l-sit hold'],
      ['abs'], ['quads', 'triceps', 'lats'], 'bodyweight', 'core', 'isolation', 'advanced', [
        'Support yourself on parallel bars or the floor with locked arms, shoulders pressed down.',
        'Raise your straight legs until they are parallel to the floor, forming an L.',
        'Hold, breathing shallowly, pressing down hard through your hands.',
        'Bend the knees to a tuck sit to regress; extend fully to progress.'
      ], [
        'Push the floor away and keep the shoulders depressed — sagging into the shoulders ends the hold early.'
      ]),

    /* ===== OBLIQUES ===== */

    E('russian_twist', 'Russian Twist', ['seated twist', 'weighted russian twist'],
      ['obliques'], ['abs'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Sit with knees bent, heels lightly touching the floor, torso leaned back 45 degrees.',
        'Hold a weight (or clasp hands) in front of your chest.',
        'Rotate your torso to one side until the weight approaches the floor, exhaling.',
        'Rotate to the other side under control — the twist comes from the ribs, not the arms swinging.'
      ], [
        'Move the chest, not just the hands — if the shoulders swing while the ribs stay square, it is fake rotation.',
        'Lift the feet to progress; keep them down to regress.'
      ]),

    E('side_plank', 'Side Plank', ['side bridge'],
      ['obliques'], ['abs', 'glutes'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Lie on your side with your elbow under your shoulder and feet stacked.',
        'Lift your hips until your body forms a straight line from ankles to head.',
        'Push the floor away with your forearm and breathe steadily.',
        'Hold for time, then switch sides — drop the bottom knee to regress.'
      ], [
        'The hips drift down as you fatigue — end the set when the line breaks, not when the timer says so.'
      ]),

    E('cable_woodchop', 'Cable Woodchop', ['high to low woodchop', 'woodchopper'],
      ['obliques'], ['abs', 'front_delts'], 'cable', 'core', 'compound', 'intermediate', [
        'Set a pulley high, stand side-on, and grip the handle with both hands above your inside shoulder.',
        'With arms fairly straight, rotate your torso to pull the handle down across your body to the far hip.',
        'Pivot your back foot and let your hips turn with the chop, exhaling.',
        'Return along the same diagonal under control.'
      ], [
        'Power comes from the trunk rotating, not the arms hauling — the arms just connect handle to torso.'
      ]),

    E('cable_low_to_high_chop', 'Low-to-High Cable Chop', ['reverse woodchop', 'low cable chop'],
      ['obliques'], ['abs', 'front_delts'], 'cable', 'core', 'compound', 'intermediate', [
        'Set a pulley low, stand side-on, and hold the handle with both hands by your inside knee.',
        'Rotate your torso up and across, sweeping the handle to above your far shoulder, exhaling.',
        'Pivot the inside foot as your hips follow the rotation.',
        'Lower back along the diagonal under control.'
      ], [
        'Think of throwing something over your far shoulder — smooth diagonal, no jerky arm pull.'
      ]),

    E('bicycle_crunch', 'Bicycle Crunch', ['bicycle', 'alternating crunch'],
      ['obliques', 'abs'], [], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Lie on your back, hands lightly behind your ears, knees over your hips.',
        'Exhale and rotate your right elbow toward your left knee while extending the right leg.',
        'Switch sides in a slow pedaling rhythm, rotating from the ribs.',
        'Keep the lower back heavy on the floor and the neck relaxed.'
      ], [
        'Slower is harder and better — racing through reps turns rotation into neck-yanking.'
      ]),

    E('dumbbell_side_bend', 'Dumbbell Side Bend', ['side bend'],
      ['obliques'], ['abs', 'forearms'], 'dumbbell', 'core', 'isolation', 'beginner', [
        'Stand tall with a dumbbell in one hand, the other hand on your hip or behind your head.',
        'Bend sideways toward the dumbbell, letting it slide down your thigh, inhaling.',
        'Pull yourself back upright and slightly past vertical using the opposite obliques, exhaling.',
        'Complete the set, then switch sides — one dumbbell at a time only.'
      ], [
        'Holding two dumbbells cancels the exercise — one side must load while the other works.'
      ]),

    E('suitcase_carry', 'Suitcase Carry', ['single arm farmer carry', 'offset carry'],
      ['obliques', 'forearms'], ['traps', 'abs', 'glutes'], 'kettlebell', 'full_body', 'compound', 'beginner', [
        'Deadlift one heavy kettlebell to your side with a flat back.',
        'Stand perfectly tall and level — the free side must not lean or hike.',
        'Walk with short, controlled steps, breathing steadily behind a braced core.',
        'Walk the distance, switch hands, and repeat on the other side.'
      ], [
        'The goal is looking symmetrical while loaded asymmetrically — a mirror or video keeps you honest.'
      ]),

    E('landmine_rotation', 'Landmine Rotation', ['landmine twist', 'landmine 180'],
      ['obliques'], ['abs', 'front_delts', 'glutes'], 'barbell', 'core', 'compound', 'intermediate', [
        'Hold the end of a landmine bar with both hands at arms length in front of your chest.',
        'With arms fairly straight, sweep the bar in an arc from one hip up and over to the other hip.',
        'Pivot your feet and rotate your hips with the bar, exhaling through each sweep.',
        'Control the arc in both directions — no free-falling to the sides.'
      ], [
        'Hips and shoulders rotate together as a unit; arms just hold the bar at radius.'
      ]),

    E('pallof_press', 'Pallof Press', ['anti-rotation press', 'cable pallof press'],
      ['obliques'], ['abs'], 'cable', 'core', 'isolation', 'beginner', [
        'Set a pulley to chest height, stand side-on to the stack, and hold the handle at your sternum with both hands.',
        'Step away until the cable pulls firmly toward the stack.',
        'Press the handle straight out from your chest and hold, resisting the pull to rotate.',
        'Return to your chest under control; finish the set, then face the other way.'
      ], [
        'Nothing should visibly move — the fight to stay square IS the exercise.',
        'Exhale as you press out; brace harder the further your hands travel.'
      ]),

    E('windshield_wiper', 'Windshield Wiper', ['hanging windshield wipers', 'lying windshield wipers'],
      ['obliques'], ['abs', 'lats', 'forearms'], 'bodyweight', 'core', 'compound', 'advanced', [
        'Hang from a bar and raise your straight legs to the bar (or lie down with legs vertical for the floor version).',
        'Keeping the legs together, sweep them side to side in a controlled arc.',
        'Exhale at each end of the arc; the shoulders and grip stay square.',
        'Reduce the arc or bend the knees to regress.'
      ], [
        'Start with the lying version — the hanging wiper demands toes-to-bar strength first.'
      ]),

    /* ===== GLUTES ===== */

    E('barbell_hip_thrust', 'Barbell Hip Thrust', ['hip thrust', 'bb hip thrust'],
      ['glutes'], ['hamstrings', 'quads', 'abs'], 'barbell', 'legs', 'compound', 'intermediate', [
        'Sit on the floor with your upper back against a bench and roll a padded barbell over your hips.',
        'Plant your feet hip width so your shins are vertical at the top.',
        'Drive through your heels and thrust your hips up until your torso is parallel to the floor, exhaling.',
        'Squeeze the glutes hard with a posterior tilt at the top, then lower under control.'
      ], [
        'Chin tucked, ribs down — arching the lower back at the top steals the glute squeeze.',
        'Full lockout with a one-count squeeze beats extra plates every time.'
      ]),

    E('smith_hip_thrust', 'Smith Machine Hip Thrust', ['smith hip thrust'],
      ['glutes'], ['hamstrings', 'quads'], 'smith', 'legs', 'compound', 'beginner', [
        'Set a bench parallel under the smith bar and sit with your upper back on it, padded bar over your hips.',
        'Unhook the bar, plant your feet, and drive your hips to full extension, exhaling.',
        'Squeeze the glutes for a one-count at the top.',
        'Lower under control and re-hook when the set ends.'
      ], [
        'The fixed path makes setup faster and steadier than a free bar — great for heavy top sets.'
      ]),

    E('glute_bridge', 'Glute Bridge', ['floor bridge', 'bodyweight hip bridge'],
      ['glutes'], ['hamstrings', 'abs'], 'bodyweight', 'legs', 'isolation', 'beginner', [
        'Lie on your back with knees bent, feet flat and hip width, arms at your sides.',
        'Drive through your heels and lift your hips until your body lines up from knees to shoulders, exhaling.',
        'Squeeze the glutes at the top for a full one-count.',
        'Lower under control until your hips hover just above the floor.'
      ], [
        'Push the knees slightly out and keep the ribs down — feel glutes, not hamstrings or lower back.'
      ]),

    E('single_leg_glute_bridge', 'Single-Leg Glute Bridge', ['one leg bridge'],
      ['glutes'], ['hamstrings', 'abs'], 'bodyweight', 'legs', 'isolation', 'intermediate', [
        'Lie on your back, one foot planted, the other leg extended or hugged to your chest.',
        'Drive through the planted heel and lift your hips to full extension, exhaling.',
        'Keep the pelvis level — no dipping toward the free leg.',
        'Lower under control and finish the set before switching legs.'
      ], [
        'A dropped hip on the free side means the glute medius quit — pause and level up before the next rep.'
      ]),

    E('cable_glute_kickback', 'Cable Glute Kickback', ['cable kickback', 'glute kickback'],
      ['glutes'], ['hamstrings'], 'cable', 'legs', 'isolation', 'beginner', [
        'Attach an ankle cuff to a low pulley, face the stack, and hold the frame for balance.',
        'Hinge slightly forward and drive the cuffed leg straight back and up, exhaling.',
        'Squeeze the glute at the top without arching your lower back.',
        'Return under control, letting the knee travel slightly forward for a stretch.'
      ], [
        'Height is not the goal — extend the hip, squeeze, and stop before the back arches.'
      ]),

    E('machine_glute_kickback', 'Machine Glute Kickback', ['glute drive', 'kickback machine'],
      ['glutes'], ['hamstrings', 'quads'], 'machine', 'legs', 'isolation', 'beginner', [
        'Set up in the kickback machine with your chest on the pad and one foot on the platform.',
        'Drive the platform back and up until your hip reaches full extension, exhaling.',
        'Squeeze for a one-count at lockout.',
        'Return under control and complete all reps before switching legs.'
      ], [
        'Push through the mid-foot and heel; toes-only pressing shifts work to the quads.'
      ]),

    E('hip_abduction_machine', 'Hip Abduction Machine', ['abduction machine', 'seated abduction'],
      ['glutes'], [], 'machine', 'legs', 'isolation', 'beginner', [
        'Sit in the machine with the pads against the outside of your knees.',
        'Push your knees apart against the resistance, exhaling.',
        'Pause at the widest point for a one-count.',
        'Return under control without letting the stack slam.'
      ], [
        'Leaning slightly forward biases the upper glutes; sitting tall hits the side glutes — both work.'
      ]),

    E('cable_pull_through', 'Cable Pull-Through', ['pull through', 'rope pull through'],
      ['glutes', 'hamstrings'], ['lower_back'], 'cable', 'legs', 'compound', 'beginner', [
        'Face away from a low pulley with a rope between your legs, held at your groin.',
        'Walk forward until the cable is taut, feet shoulder width.',
        'Push your hips straight back into a hinge, letting the rope pull between your legs, inhaling.',
        'Drive your hips forward to stand tall, exhaling and squeezing the glutes at lockout.'
      ], [
        'The best hinge teacher in the gym — the cable literally pulls your hips into the right pattern.'
      ]),

    E('reverse_lunge', 'Reverse Lunge', ['step back lunge'],
      ['glutes', 'quads'], ['hamstrings', 'adductors', 'calves'], 'dumbbell', 'legs', 'compound', 'beginner', [
        'Stand tall holding dumbbells at your sides.',
        'Step one foot back and lower until the back knee hovers just above the floor, inhaling.',
        'Keep the front shin near vertical and the torso slightly forward.',
        'Drive through the front heel to return to standing, exhaling; alternate legs.'
      ], [
        'Stepping back instead of forward spares the knees and loads the glutes — the friendlier lunge.'
      ]),

    E('curtsy_lunge', 'Curtsy Lunge', ['crossover lunge'],
      ['glutes'], ['quads', 'adductors'], 'dumbbell', 'legs', 'compound', 'intermediate', [
        'Stand tall holding dumbbells and step one leg back and across behind the other.',
        'Lower until the back knee hovers behind the front heel, keeping hips facing forward, inhaling.',
        'Drive through the front heel to return to standing, exhaling.',
        'Alternate sides with a controlled, balanced tempo.'
      ], [
        'The hips stay square to the front — the crossover comes from the legs, not from twisting.'
      ]),

    E('step_up', 'Step-Up', ['box step up', 'dumbbell step up'],
      ['quads', 'glutes'], ['hamstrings', 'calves'], 'dumbbell', 'legs', 'compound', 'beginner', [
        'Stand facing a knee-height box holding dumbbells at your sides.',
        'Place one whole foot on the box and drive through that heel to lift your body up, exhaling.',
        'Stand tall on the box, then lower under control back to the floor with the same leg working.',
        'Finish all reps on one leg before switching.'
      ], [
        'The working leg does everything — pushing off the floor leg is the universal cheat here.',
        'Raise the box height before reaching for heavier dumbbells.'
      ]),

    E('walking_lunge', 'Walking Lunge', ['dumbbell walking lunge', 'lunges'],
      ['quads', 'glutes'], ['hamstrings', 'adductors', 'calves'], 'dumbbell', 'legs', 'compound', 'intermediate', [
        'Stand tall with dumbbells at your sides and take a long step forward.',
        'Lower until both knees reach 90 degrees, back knee hovering above the floor, inhaling.',
        'Drive through the front heel and step through into the next lunge, exhaling.',
        'Continue alternating legs for distance or reps, torso tall throughout.'
      ], [
        'Longer strides bias glutes, shorter strides bias quads — pick the stride for your goal.',
        'Control the descent; the back knee should kiss the air, not crash the floor.'
      ]),

    E('kettlebell_swing', 'Kettlebell Swing', ['russian swing', 'kb swing'],
      ['glutes', 'hamstrings'], ['lower_back', 'abs', 'forearms', 'quads'], 'kettlebell', 'legs', 'compound', 'intermediate', [
        'Stand with feet shoulder width, kettlebell a foot in front of you, and hike it back between your legs with a flat back.',
        'Snap your hips forward explosively — the bell floats to chest height on its own.',
        'Let the bell swing back through your legs as you hinge, forearms brushing your inner thighs.',
        'Exhale sharply at the top of each snap; stand tall with glutes squeezed at the float.'
      ], [
        'It is a hinge, not a squat: hips back, shins vertical, and the arms are just ropes.',
        'Park the bell with a flat-back hike backward when the set ends — never bend over lazily at the end.'
      ]),

    E('sumo_deadlift', 'Sumo Deadlift', ['wide stance deadlift'],
      ['glutes', 'adductors'], ['hamstrings', 'quads', 'lower_back', 'traps', 'forearms'], 'barbell', 'pull', 'compound', 'intermediate', [
        'Take a wide stance with toes pointed out about 30-45 degrees, shins near the bar.',
        'Grip the bar inside your knees, drop your hips, and pull your chest up until your back is flat.',
        'Brace, push the knees out over the toes, and drive the floor apart to stand.',
        'Lock out with glutes squeezed, then return the bar down the same path.'
      ], [
        'Spread the floor with your feet — the knees-out cue keeps the adductors and glutes driving.',
        'The bar travels less than conventional but demands more patience off the floor.'
      ]),

    E('frog_pump', 'Frog Pump', ['frog glute bridge'],
      ['glutes'], ['hamstrings'], 'bodyweight', 'legs', 'isolation', 'beginner', [
        'Lie on your back, press the soles of your feet together, and let the knees fall out wide.',
        'Pull your heels close to your hips and tuck your chin.',
        'Drive your hips up through the outer edges of your feet, exhaling and squeezing hard.',
        'Pump reps with a short pause at the top of each.'
      ], [
        'A high-rep burner — 20-30 reps holding a dumbbell on the hips finishes any glute session.'
      ]),

    E('donkey_kick', 'Donkey Kick', ['quadruped hip extension', 'bent knee kickback'],
      ['glutes'], ['hamstrings'], 'bodyweight', 'legs', 'isolation', 'beginner', [
        'Start on hands and knees, wrists under shoulders, spine neutral.',
        'Keeping the knee bent at 90 degrees, drive one heel toward the ceiling, exhaling.',
        'Squeeze the glute at the top without arching your lower back.',
        'Lower under control and finish the set before switching legs.'
      ], [
        'The range is smaller than it feels — stop lifting when your pelvis starts to tip.'
      ]),

    E('banded_lateral_walk', 'Banded Lateral Walk', ['monster walk', 'band walk'],
      ['glutes'], ['quads'], 'band', 'legs', 'isolation', 'beginner', [
        'Place a loop band just above your knees or around your ankles and sink into a quarter squat.',
        'Step sideways, keeping tension on the band and feet pointing forward.',
        'Follow with the trailing foot without letting the feet touch together.',
        'Take 10-15 steps one way, then lead with the other leg coming back.'
      ], [
        'Stay low and level the whole way — bobbing up between steps lets the glutes rest.'
      ]),

    E('side_lying_hip_abduction', 'Side-Lying Hip Abduction', ['side leg raise', 'lying abduction'],
      ['glutes'], [], 'bodyweight', 'legs', 'isolation', 'beginner', [
        'Lie on your side, bottom leg bent for balance, top leg straight in line with your torso.',
        'Raise the top leg to about 45 degrees, heel leading and toes pointing slightly down, exhaling.',
        'Pause at the top for a one-count.',
        'Lower under control without letting the hips roll backward.'
      ], [
        'Toes down, heel up keeps the glute medius working instead of the hip flexor sneaking in.'
      ]),

    /* ===== QUADS ===== */

    E('back_squat', 'Barbell Back Squat', ['squat', 'back squat', 'barbell squat'],
      ['quads', 'glutes'], ['hamstrings', 'adductors', 'lower_back', 'abs'], 'barbell', 'legs', 'compound', 'intermediate', [
        'Set the bar on your upper traps, grip just outside your shoulders, and step back with feet shoulder width, toes slightly out.',
        'Take a big breath, brace your trunk, and sit down between your legs, knees tracking over toes.',
        'Descend until your hip crease drops below your knee, keeping the mid-foot loaded.',
        'Drive the floor away and stand tall, exhaling through the sticking point; re-breathe each rep.'
      ], [
        'Depth first, load second — a below-parallel squat with less weight builds more than a heavy quarter squat.',
        'Knees out over the toes; caving knees mean the weight is winning.'
      ]),

    E('front_squat', 'Front Squat', ['barbell front squat', 'clean grip front squat'],
      ['quads'], ['glutes', 'abs', 'upper_back', 'adductors'], 'barbell', 'legs', 'compound', 'advanced', [
        'Rack the bar on your front delts with elbows driven high, fingertips under the bar.',
        'Stand with feet shoulder width, toes slightly out, and brace.',
        'Squat straight down with an upright torso, elbows staying up throughout.',
        'Drive up out of the hole, exhaling past the sticking point, keeping the chest proud.'
      ], [
        'Elbows drop, chest drops, bar dumps — the whole lift lives in keeping the elbows up.',
        'Use a cross-arm grip or straps if wrist mobility blocks the clean grip.'
      ]),

    E('box_squat', 'Box Squat', ['barbell box squat'],
      ['quads', 'glutes'], ['hamstrings', 'lower_back', 'abs'], 'barbell', 'legs', 'compound', 'intermediate', [
        'Set a box at parallel height behind you and set up as for a back squat.',
        'Sit back onto the box under full control — settle, do not plop.',
        'Pause for a one-count without relaxing your brace.',
        'Drive straight up off the box, exhaling, without rocking forward for momentum.'
      ], [
        'The box teaches sitting back and kills the bounce — keep every rep paused and honest.'
      ]),

    E('pause_squat', 'Pause Squat', ['paused back squat'],
      ['quads', 'glutes'], ['hamstrings', 'adductors', 'abs'], 'barbell', 'legs', 'compound', 'advanced', [
        'Set up exactly as for a back squat with about 80 percent of your normal weight.',
        'Descend under control to full depth.',
        'Hold the bottom position for a strict two-to-three count, staying tight and upright.',
        'Drive up hard with no bounce, exhaling through the grind.'
      ], [
        'The pause exposes and fixes weak bottom positions — do not let the chest fall during the count.'
      ]),

    E('zercher_squat', 'Zercher Squat', ['elbow squat'],
      ['quads', 'glutes'], ['abs', 'upper_back', 'biceps', 'adductors'], 'barbell', 'legs', 'compound', 'advanced', [
        'Cradle the bar in the crooks of your elbows, hands clasped, bar padded if needed.',
        'Stand with feet shoulder width and brace hard against the front-loaded pull.',
        'Squat to full depth with an upright torso, elbows between your knees at the bottom.',
        'Stand tall, exhaling, resisting the bar rounding your upper back.'
      ], [
        'Brutal on the core and upper back in the best way — start light, the elbow discomfort fades with pads.'
      ]),

    E('goblet_squat', 'Goblet Squat', ['dumbbell goblet squat', 'kettlebell goblet squat'],
      ['quads', 'glutes'], ['abs', 'adductors'], 'dumbbell', 'legs', 'compound', 'beginner', [
        'Hold a dumbbell vertically against your chest, cupping the top head with both hands.',
        'Stand with feet shoulder width, toes slightly out.',
        'Squat down between your knees until your elbows brush the inside of your thighs, inhaling.',
        'Drive through the whole foot to stand, exhaling, chest staying proud.'
      ], [
        'The front load self-corrects your form — if you tip forward, the bell tells you immediately.',
        'The single best exercise for learning to squat.'
      ]),

    E('smith_squat', 'Smith Machine Squat', ['smith machine back squat'],
      ['quads', 'glutes'], ['hamstrings', 'adductors'], 'smith', 'legs', 'compound', 'beginner', [
        'Set the smith bar to shoulder height, duck under it, and place it across your upper traps.',
        'Walk your feet slightly forward of the bar line.',
        'Unhook and squat to parallel or below, inhaling down.',
        'Drive up through the whole foot, exhaling; re-hook at the end of the set.'
      ], [
        'Feet forward of the bar lets you sit back without balancing — that is the machine advantage; use it.'
      ]),

    E('hack_squat', 'Hack Squat', ['machine hack squat', 'hack squat machine'],
      ['quads'], ['glutes', 'adductors', 'calves'], 'machine', 'legs', 'compound', 'intermediate', [
        'Set your shoulders under the pads with your back flat on the sled and feet shoulder width, low on the platform.',
        'Release the handles and lower under control until your knees reach at least 90 degrees.',
        'Keep your hips and lower back pressed into the pad throughout.',
        'Drive through the whole foot to press back up, exhaling — stop just short of locked knees.'
      ], [
        'Feet lower on the platform biases the quads harder; higher shifts to glutes and hamstrings.',
        'Do not let the hips curl off the pad at the bottom — cut depth there instead.'
      ]),

    E('leg_press', 'Leg Press', ['45 degree leg press', 'sled press'],
      ['quads'], ['glutes', 'hamstrings', 'adductors'], 'machine', 'legs', 'compound', 'beginner', [
        'Sit with your back and hips flat against the pads, feet shoulder width in the middle of the platform.',
        'Release the safeties and lower the platform until your knees reach about 90 degrees or your hips start to curl.',
        'Keep knees tracking in line with your toes, inhaling down.',
        'Press through the whole foot to extension, exhaling — never slam into locked knees.'
      ], [
        'Range stops where your lower back starts rounding off the pad — that point, not the machine, sets your depth.',
        'Never place hands on knees to help press.'
      ]),

    E('wide_stance_leg_press', 'Wide-Stance Leg Press', ['sumo leg press'],
      ['quads', 'adductors'], ['glutes', 'hamstrings'], 'machine', 'legs', 'compound', 'beginner', [
        'Place your feet wide on the platform with toes angled out about 30 degrees.',
        'Lower the platform under control, knees tracking out over the toes, inhaling.',
        'Feel the stretch through the inner thighs at the bottom.',
        'Press back up through the whole foot, exhaling, without the knees caving in.'
      ], [
        'The wide, toes-out stance is an adductor builder — go deeper and lighter than your normal press.'
      ]),

    E('leg_extension', 'Leg Extension', ['knee extension', 'quad extension'],
      ['quads'], [], 'machine', 'legs', 'isolation', 'beginner', [
        'Set the back pad so your knees align with the pivot and the ankle roller sits on your lower shins.',
        'Grip the handles and extend your legs to full lockout, exhaling.',
        'Squeeze the quads hard at the top for a one-count.',
        'Lower under control through the full range without the stack touching down.'
      ], [
        'The squeeze at lockout is the exercise — kicking the weight up and letting it drop is wasted time.'
      ]),

    E('bulgarian_split_squat', 'Bulgarian Split Squat', ['rear foot elevated split squat', 'RFESS'],
      ['quads', 'glutes'], ['hamstrings', 'adductors', 'abs'], 'dumbbell', 'legs', 'compound', 'intermediate', [
        'Stand a stride ahead of a bench and place the top of your rear foot on it, dumbbells at your sides.',
        'Lower straight down until your rear knee nears the floor, front shin fairly vertical, inhaling.',
        'Keep the torso slightly forward and hips square.',
        'Drive through the front heel to stand, exhaling; finish the set, then switch legs.'
      ], [
        'A vertical torso and short stance hits quads; a forward lean and longer stance hits glutes.',
        'Balance improves within two sessions — do not judge the exercise on day one.'
      ]),

    E('split_squat', 'Split Squat', ['static lunge', 'dumbbell split squat'],
      ['quads', 'glutes'], ['hamstrings', 'adductors'], 'dumbbell', 'legs', 'compound', 'beginner', [
        'Take a long stride stance holding dumbbells, both feet pointing forward.',
        'Lower straight down until the back knee hovers above the floor, inhaling.',
        'Keep your front knee tracking over the toes and torso tall.',
        'Drive through the front heel to rise, exhaling; complete all reps, then switch legs.'
      ], [
        'The feet never move during the set — that is what separates it from a lunge and makes it beginner-gold.'
      ]),

    E('lateral_lunge', 'Lateral Lunge', ['side lunge'],
      ['adductors', 'quads'], ['glutes', 'hamstrings'], 'dumbbell', 'legs', 'compound', 'intermediate', [
        'Stand tall holding a dumbbell at your chest, feet together.',
        'Step wide to one side and sit your hips back over that heel, the other leg staying straight, inhaling.',
        'Descend until the working thigh nears parallel, feeling the inner-thigh stretch on the straight leg.',
        'Push off the working foot to return to standing, exhaling; alternate sides.'
      ], [
        'The trailing leg stays straight with the whole foot down — it is getting a loaded adductor stretch.'
      ]),

    E('sissy_squat', 'Sissy Squat', ['knee flexion squat'],
      ['quads'], ['abs'], 'bodyweight', 'legs', 'isolation', 'advanced', [
        'Stand holding an upright for balance, feet hip width, heels raised.',
        'Lean your torso back in one line with your thighs while driving your knees forward and down.',
        'Descend until your knees are fully flexed, hips staying extended throughout, inhaling.',
        'Pull back up through the quads, exhaling, keeping the straight hip line.'
      ], [
        'The hips never bend — body stays in one line from knees to shoulders; that is why the quads scream.'
      ]),

    E('pistol_squat', 'Pistol Squat', ['single leg squat'],
      ['quads', 'glutes'], ['hamstrings', 'abs', 'calves'], 'bodyweight', 'legs', 'compound', 'advanced', [
        'Stand on one leg with the other extended in front, arms reaching forward for counterbalance.',
        'Squat down on the standing leg until your hamstring meets your calf, inhaling.',
        'Keep the whole foot planted and the free leg off the floor.',
        'Drive back up through the standing heel to full extension, exhaling.'
      ], [
        'Progress via box pistols (sit to a box and stand) and heel-elevated reps before free-range attempts.',
        'A small counterweight held at arms length paradoxically makes balance easier.'
      ]),

    E('wall_sit', 'Wall Sit', ['wall squat hold'],
      ['quads'], ['glutes', 'calves'], 'bodyweight', 'legs', 'isolation', 'beginner', [
        'Slide your back down a wall until your thighs are parallel and knees are at 90 degrees over your ankles.',
        'Press your whole back into the wall, hands off your thighs.',
        'Breathe steadily and hold for the target time.',
        'Stand by pushing through your heels — do not slide to the floor.'
      ], [
        'Hands on thighs is a rest; cross your arms and let the quads carry all of it.'
      ]),

    E('jump_squat', 'Jump Squat', ['squat jump'],
      ['quads', 'glutes'], ['hamstrings', 'calves'], 'bodyweight', 'legs', 'compound', 'intermediate', [
        'Stand with feet shoulder width and squat to about parallel, arms swinging back.',
        'Explode upward, jumping as high as possible, swinging arms up, exhaling.',
        'Land softly on the mid-foot with bent knees, absorbing into the next squat.',
        'Reset briefly each rep — quality of landing over speed of cycling.'
      ], [
        'Landings train you as much as takeoffs — quiet feet or the set is over.'
      ]),

    E('reverse_nordic_curl', 'Reverse Nordic Curl', ['reverse nordic', 'natural quad extension'],
      ['quads'], ['abs'], 'bodyweight', 'legs', 'isolation', 'intermediate', [
        'Kneel on a pad with knees hip width, thighs and torso in one straight line, arms crossed on your chest.',
        'Keeping the hips extended, lean your whole body backward from the knees, inhaling.',
        'Descend as far as quad flexibility allows without bending at the hips.',
        'Pull yourself back upright with the quads, exhaling.'
      ], [
        'Hips locked straight is the rule — folding at the hips makes it easier and pointless.'
      ]),

    E('belt_squat', 'Belt Squat', ['hip belt squat', 'belt squat machine'],
      ['quads', 'glutes'], ['adductors', 'calves'], 'machine', 'legs', 'compound', 'intermediate', [
        'Stand on the platform, attach the belt around your hips, and release the machine lever.',
        'Squat to full depth with a tall torso — the load hangs from your hips, not your spine.',
        'Drive up through the whole foot, exhaling at the top.',
        'Re-rack via the lever when the set ends.'
      ], [
        'All the leg work with zero spinal load — the go-to squat when your back needs a week off.'
      ]),

    /* ===== HAMSTRINGS ===== */

    E('romanian_deadlift', 'Romanian Deadlift', ['RDL', 'barbell RDL', 'stiff legged deadlift'],
      ['hamstrings', 'glutes'], ['lower_back', 'forearms', 'traps'], 'barbell', 'legs', 'compound', 'intermediate', [
        'Stand holding the bar at your thighs, feet hip width, knees softly bent.',
        'Push your hips straight back, sliding the bar down your thighs with a flat back, inhaling.',
        'Descend until you feel a deep hamstring stretch — usually just below the knees.',
        'Drive your hips forward to stand tall, exhaling, squeezing the glutes at lockout.'
      ], [
        'The bar stays glued to your legs; if it drifts forward, your back is now doing hamstring work.',
        'Depth is set by your hamstring flexibility, not by touching the floor.'
      ]),

    E('dumbbell_rdl', 'Dumbbell Romanian Deadlift', ['db RDL', 'dumbbell stiff leg deadlift'],
      ['hamstrings', 'glutes'], ['lower_back', 'forearms'], 'dumbbell', 'legs', 'compound', 'beginner', [
        'Stand with dumbbells resting on the front of your thighs, knees soft.',
        'Hinge by pushing your hips back, bells sliding down the front of your legs, inhaling.',
        'Stop at the deep-stretch point with a flat back, shoulder blades set.',
        'Stand by driving the hips through, exhaling, and squeeze the glutes.'
      ], [
        'Dumbbells hug the legs even easier than a bar — keep knuckles brushing your shins on the way down.'
      ]),

    E('stiff_leg_deadlift', 'Stiff-Leg Deadlift', ['SLDL', 'straight leg deadlift'],
      ['hamstrings', 'glutes'], ['lower_back'], 'barbell', 'legs', 'compound', 'advanced', [
        'Stand on a low platform or floor with the bar at your thighs, legs nearly straight.',
        'Hinge at the hips with minimal knee bend, lowering the bar close to your legs, inhaling.',
        'Allow a deeper stretch than an RDL, keeping the back rigidly flat.',
        'Drive the hips forward to stand, exhaling — no jerking off the bottom.'
      ], [
        'Straighter knees mean a longer lever and a bigger stretch — this earns lighter loading than your RDL.'
      ]),

    E('single_leg_rdl', 'Single-Leg Romanian Deadlift', ['single leg RDL', 'one leg deadlift'],
      ['hamstrings', 'glutes'], ['lower_back', 'abs'], 'dumbbell', 'legs', 'compound', 'intermediate', [
        'Stand on one leg holding a dumbbell in the opposite hand.',
        'Hinge forward, extending the free leg straight behind you as a counterweight, inhaling.',
        'Lower until your torso and rear leg are near parallel to the floor, hips staying square.',
        'Drive the standing hip through to return upright, exhaling; switch legs after the set.'
      ], [
        'Square hips beat depth — a shallow rep with level hips is worth more than a deep twisted one.',
        'Kickstand the rear toe lightly on the floor to regress.'
      ]),

    E('lying_leg_curl', 'Lying Leg Curl', ['prone leg curl', 'hamstring curl'],
      ['hamstrings'], ['calves'], 'machine', 'legs', 'isolation', 'beginner', [
        'Lie face-down with the pad against your lower calves and knees just off the bench edge.',
        'Grip the handles and curl your heels toward your glutes, exhaling.',
        'Squeeze at full flexion for a one-count without your hips popping up.',
        'Lower under control to a full stretch.'
      ], [
        'Hips rising means momentum has taken over — press them into the pad and slow down.',
        'Point the toes to make the hamstrings work without calf assistance.'
      ]),

    E('seated_leg_curl', 'Seated Leg Curl', ['seated hamstring curl'],
      ['hamstrings'], ['calves'], 'machine', 'legs', 'isolation', 'beginner', [
        'Sit with the back pad set so your knees align with the pivot, thigh pad locked down.',
        'Start with legs extended and the roller on your lower calves.',
        'Curl your heels down and under you as far as possible, exhaling.',
        'Return under control to full extension, resisting the stack.'
      ], [
        'The seated position stretches the hamstrings at the hip AND knee — research favors it over lying curls for growth.'
      ]),

    E('standing_leg_curl', 'Standing Leg Curl', ['single leg standing curl'],
      ['hamstrings'], ['calves'], 'machine', 'legs', 'isolation', 'beginner', [
        'Stand at the machine with one leg against the roller pad, hands on the supports.',
        'Curl your heel up toward your glute, exhaling.',
        'Pause at peak flexion for a one-count.',
        'Lower under control and complete the set before switching legs.'
      ], [
        'Keep the working hip extended — letting it flex turns the curl into a hip swing.'
      ]),

    E('nordic_curl', 'Nordic Hamstring Curl', ['nordic curl', 'natural glute ham raise', 'russian lean'],
      ['hamstrings'], ['calves', 'glutes'], 'bodyweight', 'legs', 'isolation', 'advanced', [
        'Kneel on a pad with your ankles anchored under a bar or held by a partner.',
        'With hips extended and body straight from knees to head, lower yourself forward as slowly as possible.',
        'Fight the descent with your hamstrings all the way down, catching yourself with your hands.',
        'Push off the floor just enough to help the hamstrings pull you back to upright.'
      ], [
        'The eccentric is everything — even a 3-second lowering builds legendary hamstring strength.',
        'A band around your chest anchored behind you regresses it beautifully.'
      ]),

    E('glute_ham_raise', 'Glute-Ham Raise', ['GHR', 'glute ham developer'],
      ['hamstrings'], ['glutes', 'calves', 'lower_back'], 'machine', 'legs', 'compound', 'advanced', [
        'Set your feet on the GHD plate with thighs on the pad and body upright from the knees.',
        'Lower your straight torso forward under control until near parallel, inhaling.',
        'Curl yourself back to vertical by driving your heels into the plate, exhaling.',
        'Keep the hips extended throughout — the knees do the lifting.'
      ], [
        'Push-off assistance from the hands is the built-in regression — wean off it rep by rep.'
      ]),

    E('swiss_ball_leg_curl', 'Swiss Ball Leg Curl', ['stability ball leg curl', 'ball hamstring curl'],
      ['hamstrings'], ['glutes', 'abs', 'calves'], 'other', 'legs', 'isolation', 'intermediate', [
        'Lie on your back with your heels on a swiss ball, arms flat on the floor.',
        'Bridge your hips up so your body is straight from shoulders to heels.',
        'Curl the ball toward your glutes with your heels, keeping hips high, exhaling.',
        'Roll the ball back out under control without dropping the bridge.'
      ], [
        'The bridge must survive the whole set — hips sagging between reps deletes the exercise.'
      ]),

    /* ===== ADDUCTORS ===== */

    E('hip_adduction_machine', 'Hip Adduction Machine', ['adduction machine', 'seated adduction', 'inner thigh machine'],
      ['adductors'], [], 'machine', 'legs', 'isolation', 'beginner', [
        'Sit in the machine with the pads against your inner knees and select a comfortable start width.',
        'Squeeze your knees together against the resistance, exhaling.',
        'Hold the fully closed position for a one-count.',
        'Open under control to a comfortable stretch — widen the start position over time.'
      ], [
        'Progress range before load: a wider start position is a better upgrade than another plate.'
      ]),

    E('cable_hip_adduction', 'Cable Hip Adduction', ['standing cable adduction'],
      ['adductors'], ['obliques'], 'cable', 'legs', 'isolation', 'beginner', [
        'Attach an ankle cuff to a low pulley and stand side-on with the cuffed leg closest to the stack.',
        'Hold the frame for balance and let the cable pull your leg toward the machine for a stretch.',
        'Sweep the cuffed leg across your body past the standing leg, exhaling.',
        'Return under control to the stretched position; switch legs after the set.'
      ], [
        'Stay tall and quiet through the torso — swinging the body to move the stack trains nothing.'
      ]),

    E('copenhagen_plank', 'Copenhagen Plank', ['copenhagen adduction', 'adductor side plank'],
      ['adductors'], ['obliques', 'abs'], 'bodyweight', 'core', 'isolation', 'advanced', [
        'Lie on your side with your top foot or knee resting on a bench, forearm under your shoulder.',
        'Lift your hips and bottom leg off the floor so your body forms a straight line, supported by the top inner thigh.',
        'Hold, breathing steadily, squeezing the inner thigh into the bench.',
        'Lower with control and switch sides; support on the knee to regress.'
      ], [
        'Sports scientists rate this the king of groin injury prevention — build from 10-second holds.'
      ]),

    E('sumo_squat', 'Sumo Squat', ['plie squat', 'wide stance dumbbell squat'],
      ['adductors', 'glutes'], ['quads', 'hamstrings'], 'dumbbell', 'legs', 'compound', 'beginner', [
        'Stand with a very wide stance, toes out about 45 degrees, holding one dumbbell at your groin with both hands.',
        'Squat straight down between your legs, knees tracking over the toes, inhaling.',
        'Descend until your thighs near parallel, feeling the inner thighs load.',
        'Drive up through the whole foot, exhaling, squeezing the glutes at the top.'
      ], [
        'Torso stays vertical — the wide stance exists so you can sink between your legs, not fold over them.'
      ]),

    E('cossack_squat', 'Cossack Squat', ['side to side squat'],
      ['adductors', 'quads'], ['glutes', 'hamstrings'], 'bodyweight', 'legs', 'compound', 'intermediate', [
        'Take a very wide stance with toes slightly out, arms forward for balance.',
        'Shift your weight onto one leg and squat fully down over it, the other leg straightening with toes up, inhaling.',
        'Keep the working heel down and chest as tall as possible.',
        'Push back up to center, exhaling, and flow to the other side.'
      ], [
        'Hold a light counterweight at your chest to sit deeper — depth here is mobility currency.',
        'Let the straight-leg side stretch; that half of the rep is the point.'
      ]),

    E('band_hip_adduction', 'Band Hip Adduction', ['banded adduction'],
      ['adductors'], [], 'band', 'legs', 'isolation', 'beginner', [
        'Anchor a band low to a rack and loop it around the ankle nearest the anchor.',
        'Step away until the band is taut and hold something for balance.',
        'Sweep the banded leg across your body past your standing leg, exhaling.',
        'Return under control against the band pull; switch legs after the set.'
      ], [
        'High reps work best here — 15-25 smooth reps beat grinding a heavy band.'
      ]),

    E('adductor_squeeze', 'Adductor Ball Squeeze', ['ball squeeze', 'isometric adduction'],
      ['adductors'], ['abs'], 'other', 'legs', 'isolation', 'beginner', [
        'Lie on your back with knees bent and place a ball or folded pillow between your knees.',
        'Squeeze the ball as hard as comfortably possible, exhaling through the squeeze.',
        'Hold for 5-10 seconds, then release slowly.',
        'Repeat for sets; also works seated in a chair.'
      ], [
        'A rehab staple for groin issues — squeeze intensity should never spike pain above mild.'
      ]),

    /* ===== CALVES ===== */

    E('standing_calf_raise', 'Standing Calf Raise', ['machine calf raise', 'standing machine calf raise'],
      ['calves'], [], 'machine', 'legs', 'isolation', 'beginner', [
        'Set your shoulders under the pads with the balls of your feet on the platform edge, heels hanging.',
        'Lower your heels as far as they go for a deep stretch, inhaling.',
        'Pause one second in the stretch — no bouncing.',
        'Drive up onto your toes as high as possible, exhaling, and squeeze for a one-count.'
      ], [
        'The pause at the deep stretch is what forces the calf to grow — bouncing uses the tendon instead.',
        'Full range with a pause beats double the weight with half the range.'
      ]),

    E('seated_calf_raise', 'Seated Calf Raise', ['seated calf machine'],
      ['calves'], [], 'machine', 'legs', 'isolation', 'beginner', [
        'Sit with the pads on your lower thighs and the balls of your feet on the platform.',
        'Lower your heels to a full stretch, pausing for a one-count.',
        'Press up onto your toes as high as possible, exhaling.',
        'Squeeze at the top, then lower slowly.'
      ], [
        'The bent knee targets the soleus — the deep calf muscle standing raises barely touch. Do both.'
      ]),

    E('leg_press_calf_raise', 'Leg Press Calf Raise', ['calf press'],
      ['calves'], [], 'machine', 'legs', 'isolation', 'beginner', [
        'Sit in the leg press with the balls of your feet on the bottom edge of the platform, legs extended.',
        'Keep the knees straight but not hyperextended, safeties within reach.',
        'Let the platform push your toes back for a deep stretch, inhaling.',
        'Press through the balls of your feet to full plantar flexion, exhaling and squeezing.'
      ], [
        'Never unrack the safeties for calf work — a slipped foot with them off is how accidents happen.'
      ]),

    E('smith_calf_raise', 'Smith Machine Calf Raise', ['smith calf raise'],
      ['calves'], [], 'smith', 'legs', 'isolation', 'beginner', [
        'Place a block or plates under the balls of your feet beneath the smith bar.',
        'Set the bar across your upper traps and unhook it.',
        'Lower your heels to a deep stretch, pausing briefly.',
        'Rise onto your toes as high as possible, exhaling, and squeeze at the top.'
      ], [
        'The fixed bar removes all balance work, letting you focus on pure range — use a full 2-second stretch.'
      ]),

    E('donkey_calf_raise', 'Donkey Calf Raise', ['bent over calf raise'],
      ['calves'], [], 'machine', 'legs', 'isolation', 'intermediate', [
        'Hinge forward at the hips with your forearms braced on the support and hips under the pad (or a partner seated).',
        'Set the balls of your feet on the block with heels hanging.',
        'Lower to a maximal stretch — the hip hinge stretches the calves harder than standing.',
        'Drive up onto your toes, exhaling, and squeeze at the top.'
      ], [
        'The hinged hips pre-stretch the gastrocnemius — many lifters feel these deeper than any other raise.'
      ]),

    E('single_leg_calf_raise', 'Single-Leg Calf Raise', ['one leg calf raise', 'dumbbell single leg calf raise'],
      ['calves'], [], 'dumbbell', 'legs', 'isolation', 'intermediate', [
        'Stand with the ball of one foot on a step, holding a dumbbell on the same side, other hand braced for balance.',
        'Hook the free foot behind your working ankle.',
        'Lower the heel to a deep stretch with a one-second pause.',
        'Drive up to full height on your toes, exhaling; finish the set, then switch legs.'
      ], [
        'One leg at a time doubles the load and exposes the weaker calf — start every set with it.'
      ]),

    E('bodyweight_calf_raise', 'Bodyweight Calf Raise', ['standing calf raise bodyweight', 'calf raises'],
      ['calves'], [], 'bodyweight', 'legs', 'isolation', 'beginner', [
        'Stand with the balls of your feet on a step, heels hanging off, fingertips on a wall for balance.',
        'Lower your heels below the step to a full stretch, inhaling.',
        'Pause, then rise as high onto your toes as possible, exhaling.',
        'Squeeze at the top for a one-count each rep.'
      ], [
        'Aim for high reps (15-25) with a strict pause top and bottom — momentum is the enemy of calf growth.'
      ]),

    E('barbell_calf_raise', 'Barbell Calf Raise', ['standing barbell calf raise'],
      ['calves'], [], 'barbell', 'legs', 'isolation', 'intermediate', [
        'Set a barbell across your upper traps inside a rack, with a small plate or block under the balls of your feet.',
        'Stand tall and lower your heels to a full stretch, inhaling.',
        'Rise onto your toes as high as possible, exhaling, balancing through the big toe.',
        'Squeeze at the top, then lower slowly.'
      ], [
        'Balance limits the load here — do these inside the rack with the pins set as a safety net.'
      ]),

    /* ===== OLYMPIC ===== */

    E('power_clean', 'Power Clean', ['clean', 'barbell power clean'],
      ['glutes', 'hamstrings', 'traps'], ['quads', 'lower_back', 'forearms', 'front_delts'], 'barbell', 'olympic', 'compound', 'advanced', [
        'Set up over the bar as for a deadlift, grip just outside your legs, back flat and chest up.',
        'Pull the bar from the floor keeping it close; as it passes your knees, explode with the hips.',
        'Shrug hard and pull yourself under, catching the bar on your front delts in a quarter squat with elbows whipped high.',
        'Stand tall to finish, then lower the bar to the floor and reset every rep.'
      ], [
        'It is a jump with a bar in your hands — the arms only guide after the hips fire.',
        'Learn the catch with an empty bar; a slow elbow whip is the most common failure point.'
      ]),

    E('hang_power_clean', 'Hang Power Clean', ['hang clean'],
      ['glutes', 'hamstrings', 'traps'], ['quads', 'forearms', 'front_delts', 'lower_back'], 'barbell', 'olympic', 'compound', 'advanced', [
        'Deadlift the bar to standing, then hinge to lower it just above your knees — this is the hang position.',
        'Explode your hips forward, shrugging violently as the bar accelerates up your thighs.',
        'Pull under and catch the bar on your front delts in a quarter squat, elbows high.',
        'Stand to finish and return to the hang for the next rep.'
      ], [
        'Starting from the hang isolates the explosive hip drive — master it before full cleans from the floor.'
      ]),

    E('clean_and_jerk', 'Clean and Jerk', ['C&J', 'clean & jerk'],
      ['glutes', 'quads', 'front_delts'], ['hamstrings', 'traps', 'triceps', 'abs', 'lower_back'], 'barbell', 'olympic', 'compound', 'advanced', [
        'Clean the bar from the floor to your front delts, standing tall out of the catch.',
        'Dip straight down a few inches with a vertical torso.',
        'Drive the bar overhead explosively, splitting or re-bending the legs to catch it locked out.',
        'Recover your feet in line, bar stable overhead, then lower to the shoulders and the floor.'
      ], [
        'Two lifts in one — train the clean and the jerk separately before combining them heavy.',
        'Coaching beats YouTube here; even a few sessions with a coach transforms the movement.'
      ]),

    E('power_snatch', 'Power Snatch', ['snatch', 'barbell snatch'],
      ['glutes', 'hamstrings', 'traps'], ['quads', 'front_delts', 'side_delts', 'lower_back', 'forearms'], 'barbell', 'olympic', 'compound', 'advanced', [
        'Take a very wide grip so the bar sits at your hip crease when standing, and set a flat back over the bar.',
        'Pull from the floor keeping the bar close; explode the hips as it reaches your thighs.',
        'Shrug and punch the bar straight overhead in one motion, catching it locked out in a quarter squat.',
        'Stabilize, stand tall, then lower with control.'
      ], [
        'The bar travels floor-to-overhead in one uninterrupted pull — start with a PVC pipe, honestly.'
      ]),

    E('push_jerk', 'Push Jerk', ['power jerk', 'barbell jerk'],
      ['front_delts', 'quads'], ['triceps', 'side_delts', 'glutes', 'abs'], 'barbell', 'olympic', 'compound', 'advanced', [
        'Stand with the bar racked on your front delts, elbows slightly down from clean position.',
        'Dip a few inches with a vertical torso, then drive the bar up explosively with the legs.',
        'As the bar leaves the shoulders, re-bend your knees and punch yourself under it, catching at lockout.',
        'Stand to full extension with the bar stacked over your ears.'
      ], [
        'Unlike the push press, you drop UNDER the bar — the re-bend is what lets you jerk more than you press.'
      ]),

    /* ===== FULL BODY / KETTLEBELL ===== */

    E('thruster', 'Thruster', ['squat to press', 'barbell thruster'],
      ['quads', 'front_delts'], ['glutes', 'triceps', 'abs', 'hamstrings'], 'barbell', 'full_body', 'compound', 'intermediate', [
        'Hold the bar in a front rack position, feet shoulder width.',
        'Squat to full depth keeping the elbows up, inhaling down.',
        'Drive up hard and use the momentum to press the bar overhead in one continuous motion, exhaling.',
        'Lower the bar back to the rack as you descend into the next squat.'
      ], [
        'One fluid motion, not a squat then a press — the legs launch the bar past the sticking point.'
      ]),

    E('burpee', 'Burpee', ['burpees'],
      ['quads', 'chest'], ['abs', 'front_delts', 'triceps', 'glutes', 'calves'], 'bodyweight', 'full_body', 'compound', 'beginner', [
        'From standing, crouch and place your hands on the floor.',
        'Jump your feet back to a plank and lower your chest to the floor.',
        'Push up as you snap your feet back under you.',
        'Jump vertically with arms overhead, then absorb the landing into the next rep.'
      ], [
        'Pace like a metronome — smooth continuous burpees beat five fast ones and a long gasp.',
        'Step the feet back instead of jumping to regress.'
      ]),

    E('turkish_get_up', 'Turkish Get-Up', ['TGU', 'get up'],
      ['abs', 'front_delts'], ['obliques', 'glutes', 'triceps', 'quads'], 'kettlebell', 'full_body', 'compound', 'advanced', [
        'Lie on your back holding a kettlebell locked out over your right shoulder, right knee bent, left arm and leg at 45 degrees.',
        'Roll onto your left elbow, then your left hand, keeping the bell vertical and your eyes on it.',
        'Sweep your left leg back to a kneeling lunge, then stand up, bell still locked overhead.',
        'Reverse every step precisely back to lying down; switch sides after the rep.'
      ], [
        'Slow is the technique — a quality get-up takes 30 seconds each way.',
        'Learn the sequence with a shoe balanced on your fist before touching a bell.'
      ]),

    E('kettlebell_clean_and_press', 'Kettlebell Clean and Press', ['kb clean and press', 'clean to press'],
      ['front_delts', 'glutes'], ['hamstrings', 'triceps', 'abs', 'forearms', 'traps'], 'kettlebell', 'full_body', 'compound', 'intermediate', [
        'Hike the bell back between your legs and clean it to the rack position in one hip snap, taming the arc so it rolls gently onto your forearm.',
        'Pause in the rack: elbow tucked, wrist neutral, glutes tight.',
        'Press the bell overhead to lockout, exhaling.',
        'Lower to the rack, then drop and re-hike into the next clean; switch arms mid-set or by set.'
      ], [
        'A banging forearm means the bell is arcing wide — keep the elbow close and let the bell roll around the wrist.'
      ]),

    E('kettlebell_snatch', 'Kettlebell Snatch', ['kb snatch'],
      ['glutes', 'hamstrings'], ['front_delts', 'traps', 'forearms', 'abs'], 'kettlebell', 'full_body', 'compound', 'advanced', [
        'Hike the bell back between your legs with a flat back.',
        'Snap the hips and pull the bell up close to your body, elbow leading high.',
        'As it reaches shoulder height, punch your hand through so the bell rolls softly onto your forearm at lockout overhead.',
        'Lower by casting the bell forward and re-hiking into the next rep.'
      ], [
        'The punch-through at the top prevents the bell from flipping and smacking the wrist — timing over muscle.'
      ]),

    E('kettlebell_front_squat', 'Kettlebell Front Squat', ['double kettlebell squat', 'kb rack squat'],
      ['quads', 'glutes'], ['abs', 'adductors', 'upper_back'], 'kettlebell', 'legs', 'compound', 'intermediate', [
        'Clean two kettlebells to the rack position, elbows tucked and bells resting on forearms and chest.',
        'Stand with feet shoulder width, toes slightly out.',
        'Squat to full depth keeping the torso tall against the front load, inhaling down.',
        'Drive up through the whole foot, exhaling at the top.'
      ], [
        'The rack load punishes any forward lean instantly — a built-in posture coach for your squat.'
      ]),

    E('kettlebell_halo', 'Kettlebell Halo', ['halo'],
      ['front_delts'], ['triceps', 'obliques', 'abs', 'upper_back'], 'kettlebell', 'push', 'isolation', 'beginner', [
        'Hold a kettlebell upside down by the horns at chest height, ribs down, glutes tight.',
        'Circle the bell slowly around your head at collar height, keeping it close.',
        'Breathe steadily and keep the torso perfectly still — only the arms travel.',
        'Alternate directions each rep or set.'
      ], [
        'Tight circles close to the head — wide lazy orbits turn shoulder mobility work into neck strain.'
      ]),

    E('sled_push', 'Sled Push', ['prowler push'],
      ['quads', 'glutes'], ['calves', 'hamstrings', 'abs', 'front_delts'], 'other', 'full_body', 'compound', 'beginner', [
        'Grip the sled poles with arms extended or bent, body in a straight forward lean.',
        'Drive the sled forward with powerful alternating steps, pushing through the whole foot.',
        'Keep your spine long — power comes from leg drive, not back arch.',
        'Push for distance or time; walk heavy, run light.'
      ], [
        'No eccentric means little soreness — brutal conditioning you can do the day before leg day.'
      ]),

    E('medicine_ball_slam', 'Medicine Ball Slam', ['ball slam', 'slam ball'],
      ['abs', 'lats'], ['front_delts', 'obliques', 'glutes'], 'other', 'full_body', 'compound', 'beginner', [
        'Stand with feet shoulder width holding a slam ball at your chest.',
        'Rise onto your toes and swing the ball fully overhead, stretching tall.',
        'Slam the ball into the floor with maximal force, exhaling hard and folding through the trunk.',
        'Catch the ball on the bounce (or pick it up) and flow into the next rep.'
      ], [
        'Use a no-bounce slam ball — a live medicine ball will return the favor to your face.'
      ]),

    E('wall_ball', 'Wall Ball', ['wall ball shot'],
      ['quads', 'front_delts'], ['glutes', 'triceps', 'abs'], 'other', 'full_body', 'compound', 'intermediate', [
        'Stand an arms length from a wall holding a medicine ball at your chin.',
        'Squat to full depth, inhaling, keeping the ball tight.',
        'Drive up and throw the ball to the target height in one motion, exhaling.',
        'Absorb the catch back at your chin as you descend into the next squat.'
      ], [
        'Rhythm is everything — catch, sink, and throw in one continuous wave, not three separate moves.'
      ]),

    E('renegade_row', 'Renegade Row', ['plank row', 'push-up position row'],
      ['upper_back', 'abs'], ['lats', 'biceps', 'obliques', 'front_delts'], 'dumbbell', 'full_body', 'compound', 'advanced', [
        'Set up in a push-up position gripping two hexagonal dumbbells, feet wide for stability.',
        'Brace hard and row one bell to your hip while the other arm supports.',
        'Lower it under control and row the other side — hips stay level as if in a plank contest.',
        'Alternate sides, exhaling on each row.'
      ], [
        'The row is the excuse; anti-rotation is the exercise — if your hips twist, narrow the row and widen the feet.'
      ]),

    E('trap_bar_deadlift', 'Trap Bar Deadlift', ['hex bar deadlift', 'trap bar DL'],
      ['glutes', 'quads'], ['hamstrings', 'traps', 'lower_back', 'forearms'], 'trap_bar', 'legs', 'compound', 'beginner', [
        'Stand centered inside the trap bar with feet hip-to-shoulder width.',
        'Hinge and bend the knees to grip the handles, flatten your back, and pull your chest up.',
        'Brace and drive the floor away, standing tall in one piece, exhaling through the sticking point.',
        'Lock out with glutes squeezed, then lower under control back to the floor.'
      ], [
        'The neutral grip and centered load make this the friendliest heavy pull — most people should deadlift here first.'
      ]),

    /* ===== CARDIO ===== */

    E('treadmill_run', 'Treadmill Run', ['run', 'running', 'treadmill'],
      ['quads', 'hamstrings'], ['calves', 'glutes'], 'machine', 'cardio', 'compound', 'beginner', [
        'Set a 1 percent incline to mimic outdoor effort and start at an easy jog.',
        'Run tall with a slight forward lean, landing your feet under your hips.',
        'Keep a cadence quick and light — aim for quiet footfalls.',
        'For easy runs, hold a pace where you can speak full sentences; intervals go harder with walking recoveries.'
      ], [
        'Most runs should feel easy — the conversational-pace rule builds the engine without wrecking recovery.'
      ]),

    E('outdoor_run', 'Outdoor Run', ['road run', 'jogging', 'jog'],
      ['quads', 'hamstrings'], ['calves', 'glutes'], 'bodyweight', 'cardio', 'compound', 'beginner', [
        'Start with a few minutes of brisk walking or easy jogging to warm up.',
        'Run tall, arms swinging relaxed at your sides, feet landing beneath you.',
        'Breathe rhythmically — in for two or three steps, out for two.',
        'Finish with an easy cool-down walk and light calf stretching.'
      ], [
        'Increase weekly distance by no more than about 10 percent — shins and knees adapt slower than lungs.'
      ]),

    E('rowing_machine', 'Rowing Machine', ['row erg', 'erg', 'concept2', 'indoor rowing'],
      ['upper_back', 'quads'], ['lats', 'hamstrings', 'glutes', 'biceps', 'abs'], 'machine', 'cardio', 'compound', 'beginner', [
        'Strap in and catch with shins vertical, arms long, back flat and hinged slightly forward.',
        'Drive with the legs first, then swing the torso back, then pull the handle to your lower ribs.',
        'Reverse on the recovery: arms away, torso forward, then knees bend — twice as slow as the drive.',
        'Hold 20-28 strokes per minute; power comes from the legs, not yanking with the arms.'
      ], [
        'The sequence is legs-body-arms on the drive, arms-body-legs coming back — most beginners reverse it.',
        'Watch the split time, not the stroke rate; slower, stronger strokes usually win.'
      ]),

    E('stationary_bike', 'Stationary Bike', ['spin bike', 'exercise bike', 'cycling'],
      ['quads'], ['hamstrings', 'glutes', 'calves'], 'machine', 'cardio', 'compound', 'beginner', [
        'Set the saddle so your knee keeps a slight bend at the bottom of the pedal stroke.',
        'Pedal in smooth circles at 80-100 rpm, hands relaxed on the bars.',
        'Adjust resistance so the effort matches the session: easy spin, steady state, or hard intervals.',
        'Keep your upper body quiet — rocking shoulders waste watts.'
      ], [
        'Saddle height is everything: too low burns knees, too high rocks hips. Heel on pedal, straight leg = correct.'
      ]),

    E('incline_treadmill_walk', 'Incline Treadmill Walk', ['incline walk', '12-3-30', 'uphill walk'],
      ['glutes', 'calves'], ['quads', 'hamstrings'], 'machine', 'cardio', 'compound', 'beginner', [
        'Set the treadmill to a steep incline (8-15 percent) at a moderate walking pace.',
        'Walk tall without holding the rails, driving through your heels and glutes.',
        'Swing your arms naturally and breathe steadily.',
        'Sustain for 20-40 minutes; drop the incline if you must grab the rails.'
      ], [
        'Holding the rails deletes half the workout — lower the incline until your hands can let go.'
      ]),

    E('stair_climber', 'Stair Climber', ['stairmaster', 'step mill'],
      ['glutes', 'quads'], ['calves', 'hamstrings'], 'machine', 'cardio', 'compound', 'beginner', [
        'Step on and start slow, standing tall with fingertips only lightly on the rails.',
        'Take full steps, pressing through the heel and mid-foot of each stair.',
        'Keep your hips under your shoulders — no leaning heavily on the console.',
        'Climb at a pace you can hold for 15-30 minutes, or do intervals of fast and easy floors.'
      ], [
        'Full-foot steps use the glutes; tip-toe bouncing shifts everything to the calves and knees.'
      ]),

    E('jump_rope', 'Jump Rope', ['skipping', 'skip rope'],
      ['calves'], ['quads', 'forearms', 'front_delts'], 'other', 'cardio', 'compound', 'beginner', [
        'Size the rope: handles should reach your armpits when you stand on its middle.',
        'Jump just an inch or two off the floor with soft knees, on the balls of your feet.',
        'Spin the rope from the wrists, elbows close to your ribs.',
        'Work in intervals — 30-60 seconds jumping, short rests — building to continuous minutes.'
      ], [
        'Small wrist circles and tiny hops — big arm swings and high jumps burn out in seconds.',
        'Calves take a beating at first; start on forgiving floors, not concrete.'
      ]),

    E('elliptical', 'Elliptical', ['cross trainer', 'elliptical trainer'],
      ['quads', 'glutes'], ['hamstrings', 'calves', 'upper_back'], 'machine', 'cardio', 'compound', 'beginner', [
        'Step on and start pedaling forward with an upright posture, whole feet on the pedals.',
        'Push and pull the handles actively to share the work with your upper body.',
        'Adjust resistance so your effort is honest — momentum should not carry the stride.',
        'Maintain steady effort for 20-40 minutes or alternate hard and easy intervals.'
      ], [
        'Zero impact makes it the go-to on recovery days and around lower-body injuries.'
      ]),

    E('assault_bike', 'Assault Bike', ['air bike', 'fan bike', 'airdyne'],
      ['quads'], ['hamstrings', 'front_delts', 'upper_back', 'calves'], 'machine', 'cardio', 'compound', 'intermediate', [
        'Set the saddle height for a slight knee bend and grip the moving handles.',
        'Drive the pedals and handles together — push and pull with arms as the legs pump.',
        'The fan scales with effort: the harder you go, the harder it resists.',
        'Use intervals: 15-30 seconds hard, 60-90 seconds easy, repeated.'
      ], [
        'The bike gives back exactly what you put in — pace the first interval or the last ones will pace you.'
      ]),

    E('battle_ropes', 'Battle Ropes', ['rope waves', 'heavy ropes'],
      ['front_delts'], ['abs', 'forearms', 'upper_back', 'obliques'], 'other', 'cardio', 'compound', 'beginner', [
        'Hold a rope end in each hand in an athletic stance, knees soft, core braced.',
        'Whip alternating waves down the rope, driving from the shoulders and hips.',
        'Keep the waves tall and continuous, breathing rhythmically.',
        'Work intervals of 20-30 seconds hard with equal or double rest.'
      ], [
        'Sink lower and use your legs as the shoulders tire — the waves die when you stand up straight.'
      ]),

    E('swimming', 'Swimming', ['lap swimming', 'freestyle swim'],
      ['lats', 'front_delts'], ['triceps', 'upper_back', 'abs', 'glutes'], 'other', 'cardio', 'compound', 'intermediate', [
        'Swim freestyle with long strokes, rotating your body along its axis with each pull.',
        'Exhale continuously underwater and breathe to the side every two or three strokes.',
        'Kick lightly from the hips — the legs steady you, the arms propel you.',
        'Swim intervals of 50-100 m with short rests, building total distance over weeks.'
      ], [
        'Breathing drills are the unlock: most beginners exhaust themselves holding their breath, not swimming.'
      ]),

    E('sprint_intervals', 'Sprint Intervals', ['sprints', 'HIIT sprints', 'track sprints'],
      ['hamstrings', 'glutes'], ['quads', 'calves', 'abs'], 'bodyweight', 'cardio', 'compound', 'advanced', [
        'Warm up thoroughly with 10 minutes of jogging, leg swings, and progressively faster strides.',
        'Sprint 60-100 m at 85-95 percent effort, running tall with powerful arm drive.',
        'Walk back slowly for full recovery — 2-3 minutes between sprints.',
        'Do 6-10 repeats; quality over quantity, stopping while form is still crisp.'
      ], [
        'Sprinting cold is the classic hamstring tear — the warm-up is non-negotiable.',
        'Think 90 percent smooth, not 100 percent frantic; relaxed sprinting is faster and safer.'
      ]),

    /* ===== UNILATERAL LOWER (V2) ===== */

    E('lateral_step_down', 'Lateral Step-Down', ['step down', 'lateral step down', 'knee stability step down'],
      ['quads'], ['glutes', 'calves'], 'bodyweight', 'legs', 'compound', 'beginner', [
        'Stand sideways on a low step or plate stack with one foot planted and the other hanging off the edge.',
        'Sit your hips back slightly and bend the standing knee, lowering the free heel toward the floor, inhaling.',
        'Keep the standing knee tracking over the middle toes and the hips level — no collapsing inward.',
        'Tap the heel lightly (do not stand on it) and drive back up through the standing leg, exhaling.'
      ], [
        'Slow three-second descents build the knee control that protects you on runs and rucks — speed is nothing here.',
        'Raise the step height to progress; hold a light dumbbell at your chest only after the height maxes out.'
      ]),

    E('skater_squat', 'Skater Squat', ['single leg bench squat', 'skater pistol'],
      ['glutes', 'quads'], ['hamstrings', 'abs'], 'bodyweight', 'legs', 'compound', 'advanced', [
        'Stand on one leg with the other knee bent behind you, shin roughly parallel to the floor, arms reaching forward.',
        'Hinge and bend the standing leg to lower your rear knee toward a pad on the floor behind you, inhaling.',
        'Lean your torso forward for balance and keep the standing heel planted throughout.',
        'Lightly touch the pad with the rear knee, then drive back up to standing, exhaling; switch legs after the set.'
      ], [
        'Stack pads and shrink the stack over weeks — a shorter drop today beats a collapsed rep.',
        'Light counterweights held at arms length actually make balancing easier.'
      ]),

    E('deficit_reverse_lunge', 'Deficit Reverse Lunge', ['reverse lunge from deficit', 'deficit lunge'],
      ['quads', 'glutes'], ['hamstrings', 'adductors'], 'dumbbell', 'legs', 'compound', 'intermediate', [
        'Stand on a low platform or plate stack holding dumbbells at your sides.',
        'Step one foot back off the platform into a long lunge, lowering the rear knee toward the floor, inhaling.',
        'Let the front knee travel forward over the toes — the extra depth from the deficit is the point.',
        'Drive through the front whole foot to step back up onto the platform, exhaling; alternate or finish one side.'
      ], [
        'The deficit adds range, not load — go lighter than your normal reverse lunge and own the deep position.'
      ]),

    E('single_leg_squat_to_box', 'Single-Leg Box Squat', ['box pistol', 'single leg sit to stand'],
      ['quads', 'glutes'], ['hamstrings', 'abs'], 'bodyweight', 'legs', 'compound', 'intermediate', [
        'Stand on one leg in front of a bench or box, the free leg extended forward, arms reaching out as a counterbalance.',
        'Sit back and down slowly onto the box, keeping the standing heel planted, inhaling.',
        'Touch down under control — no plopping — and pause for a one-count without rocking backward.',
        'Drive through the standing leg to return to full standing, exhaling; finish the set, then switch legs.'
      ], [
        'Lower the box over weeks — this is the honest road to a full pistol squat.',
        'If you fall onto the box, the box is too low or the descent too fast.'
      ]),

    E('kickstand_rdl', 'Kickstand RDL', ['b-stance rdl', 'staggered stance rdl'],
      ['hamstrings', 'glutes'], ['lower_back', 'abs'], 'dumbbell', 'legs', 'compound', 'beginner', [
        'Stand holding dumbbells with one foot flat and the other slid back so only its toes touch, heel up — like a kickstand.',
        'Hinge at the hips, pushing them straight back while the front leg takes almost all the load, inhaling.',
        'Lower the bells along the front thigh until you feel a strong hamstring stretch, back staying flat.',
        'Drive the front hip through to stand tall, exhaling; complete the set, then switch sides.'
      ], [
        'The rear toes are for balance only — think 90 percent of your weight through the front foot.',
        'Master this before the full single-leg RDL; it trains the same hinge without the balance circus.'
      ]),

    E('single_leg_hip_thrust', 'Single-Leg Hip Thrust', ['one leg hip thrust', 'sl hip thrust'],
      ['glutes'], ['hamstrings', 'abs'], 'bodyweight', 'legs', 'compound', 'intermediate', [
        'Set your upper back on a bench, feet planted, then extend one leg straight or hold that knee to your chest.',
        'Drive through the planted heel and lift your hips until the working thigh and torso form a straight line, exhaling.',
        'Squeeze the working glute hard at the top for a one-count, hips staying dead level.',
        'Lower under control without touching down fully between reps; switch legs after the set.'
      ], [
        'A tilting pelvis means the glute has quit — end the set when the hips stop staying square.',
        'Add a dumbbell over the working hip only once 12 strict reps feel easy.'
      ]),

    E('bent_knee_calf_raise', 'Bent-Knee Calf Raise', ['soleus raise', 'bent knee heel raise'],
      ['calves'], [], 'bodyweight', 'legs', 'isolation', 'beginner', [
        'Stand with the balls of your feet on a step, fingertips on a wall, and bend both knees about 30 degrees.',
        'Hold that knee bend constant — it shifts the work to the soleus, the deep calf muscle under the gastrocnemius.',
        'Lower your heels below the step to a full stretch with a one-second pause, inhaling.',
        'Press up onto your toes while keeping the knees bent, exhaling, and squeeze at the top.'
      ], [
        'The soleus does most of the work in running and rucking — bent-knee volume is tendon insurance, not vanity.',
        'If the knees straighten as you tire, the set is over.'
      ]),

    /* ===== DURABILITY (V2) — checklist accessory work ===== */

    E('tibialis_raise', 'Tibialis Raise', ['tib raise', 'shin raise', 'toe lift'],
      ['calves'], [], 'bodyweight', 'durability', 'isolation', 'beginner', [
        'Lean your back against a wall with your heels a foot or so out in front of you, legs straight.',
        'Keeping the heels planted, lift the toes and balls of both feet as high toward your shins as possible, exhaling.',
        'This trains the tibialis anterior on the front of the shin — the muscle opposite the calf (tracked under calves here).',
        'Lower the toes under control until they nearly touch the floor and repeat without resting at the bottom.'
      ], [
        'Shin durability is run insurance — 2-3 sets of 15-25 slow reps keeps shin splints away.',
        'Walk your heels further from the wall to make it harder.'
      ]),

    E('wall_tibialis_hold', 'Wall Tibialis Hold', ['tib hold', 'wall shin hold'],
      ['calves'], [], 'bodyweight', 'durability', 'isolation', 'beginner', [
        'Lean your back against a wall with your heels out in front and legs straight.',
        'Pull the toes of both feet up toward your shins as high as they will go and hold, breathing steadily.',
        'The burn lands on the front of the shin (tibialis anterior) — logged under calves, but it works the opposite side.',
        'Hold for 20-45 seconds, lower slowly, and rest before the next hold.'
      ], [
        'Pair holds with rucking blocks — the tibialis absorbs every downhill step your boots take.'
      ]),

    E('heel_walk', 'Heel Walk', ['heel walking', 'shin walk'],
      ['calves'], [], 'bodyweight', 'durability', 'isolation', 'beginner', [
        'Stand tall and lift the toes of both feet so only your heels touch the floor.',
        'Walk forward with short steps, toes pulled up hard toward the shins the entire time.',
        'Keep your posture upright — no leaning back or looking down at your feet.',
        'Walk 15-25 meters, rest, and repeat; the front of the shins should burn, not the calves.'
      ], [
        'A zero-equipment shin-splint vaccine — sneak it into warm-ups before every run.'
      ]),

    E('toe_walk', 'Toe Walk', ['toe walking', 'calf walk'],
      ['calves'], [], 'bodyweight', 'durability', 'isolation', 'beginner', [
        'Rise as high as possible onto the balls of both feet, heels well clear of the floor.',
        'Walk forward with short, controlled steps, staying at full height on every step.',
        'Keep the ankles stacked and strong — do not let them wobble outward.',
        'Walk 15-25 meters, rest, and repeat; hold light dumbbells to progress.'
      ], [
        'Height is the rep standard: the moment the heels sink halfway, stop and rest.'
      ]),

    E('banded_terminal_knee_extension', 'Terminal Knee Extension', ['TKE', 'banded tke', 'terminal knee extension band'],
      ['quads'], [], 'band', 'durability', 'isolation', 'beginner', [
        'Anchor a band at knee height and loop it behind one knee, then step back until the band is taut.',
        'Stand with that foot flat and the knee slightly bent, the band pulling the knee forward.',
        'Squeeze the quad to straighten the knee fully against the band, exhaling, and hold the lockout for a one-count.',
        'Let the knee bend softly again under control and repeat; switch legs after the set.'
      ], [
        'Tiny range, big payoff — it wakes the inner quad that keeps the kneecap tracking on runs and rucks.'
      ]),

    E('hip_airplane', 'Hip Airplane', ['standing hip rotation', 'hip airplanes'],
      ['glutes'], ['hamstrings', 'abs', 'obliques'], 'bodyweight', 'durability', 'compound', 'intermediate', [
        'Stand on one leg, hinge forward until your torso and rear leg are near parallel with the floor, arms out like wings.',
        'From that arrow position, slowly rotate your whole torso and hips open toward the ceiling on the standing-leg side.',
        'Reverse and rotate closed, turning your belly button toward the standing foot, moving only as far as you can control.',
        'Keep the standing knee soft and the foot gripping the floor; do 4-6 slow rotations each way, then switch legs.'
      ], [
        'This is single-leg hip control, not a stretch — smaller controlled arcs beat big wobbly ones.',
        'Fingertips on a wall or rig make it a beginner drill; hands-free makes it humbling.'
      ]),

    E('clamshell', 'Clamshell', ['banded clamshell', 'clam'],
      ['glutes'], [], 'band', 'durability', 'isolation', 'beginner', [
        'Lie on your side with knees bent about 90 degrees, feet together, a mini-band looped just above the knees.',
        'Stack your hips vertically and keep your feet touching throughout.',
        'Open the top knee against the band as far as you can without the pelvis rolling backward, exhaling.',
        'Pause at the top for a one-count, then close slowly under control; switch sides after the set.'
      ], [
        'The rolling pelvis is the classic cheat — pin your top hip forward and the side glute has nowhere to hide.'
      ]),

    E('towel_hang', 'Towel Grip Hang', ['towel dead hang', 'towel hang'],
      ['forearms'], ['lats', 'biceps'], 'bodyweight', 'durability', 'isolation', 'intermediate', [
        'Drape one or two towels over a pull-up bar and grip a towel end tightly in each hand.',
        'Hang with straight arms and feet off the floor, shoulders lightly packed.',
        'Crush the towels the entire hold — the thick, soft grip is what makes it brutal.',
        'Hold for 10-30 seconds and step off before your grip fails completely.'
      ], [
        'Closest thing in a gym to rope, rock, and rucksack grip — build to 30 seconds before adding a weight vest.'
      ]),

    E('bottoms_up_carry', 'Bottoms-Up Kettlebell Carry', ['bottoms up walk', 'upside down kettlebell carry'],
      ['forearms'], ['front_delts', 'abs', 'obliques'], 'kettlebell', 'durability', 'compound', 'intermediate', [
        'Clean a light kettlebell to shoulder height upside down, holding the handle with the bell balanced above your fist.',
        'Keep the elbow under the wrist and the wrist dead straight — crush the handle to keep the bell from tipping.',
        'Walk slowly with short steps, eyes forward, core braced against the offset load.',
        'Walk a set distance, park the bell safely, and switch hands.'
      ], [
        'Go far lighter than pride suggests — a falling bell teaches humility fast, so keep the free hand ready to catch.'
      ]),

    /* ===== ANTI-ROTATION CORE (V2) ===== */

    E('suitcase_hold', 'Suitcase Hold', ['single arm static hold', 'unilateral farmer hold'],
      ['obliques'], ['forearms', 'abs', 'traps'], 'dumbbell', 'core', 'isolation', 'beginner', [
        'Deadlift one heavy dumbbell or kettlebell to your side with a flat back and stand tall.',
        'Lock your posture perfectly level — shoulders square, free side neither leaning nor hiking.',
        'Hold for 20-40 seconds, breathing steadily behind a braced core while the side opposite the weight fights the tilt.',
        'Set the weight down with a flat back, rest, and switch hands.'
      ], [
        'It is the standing-still version of the suitcase carry — if a mirror shows any lean, drop weight, not standards.'
      ]),

    E('half_kneeling_pallof_press', 'Half-Kneeling Pallof Press', ['kneeling pallof', 'half kneeling anti-rotation press'],
      ['obliques'], ['abs', 'glutes'], 'band', 'core', 'isolation', 'beginner', [
        'Anchor a band at chest height, kneel side-on to it with the inside knee down and outside foot planted forward.',
        'Hold the band with both hands at your sternum, far enough away that it pulls firmly toward the anchor.',
        'Press your hands straight out from your chest and hold for a two-count, resisting the pull to twist, exhaling.',
        'Return to the sternum under control; finish the set, then turn to face the other way.'
      ], [
        'The narrow kneeling base steals the help of the legs — squeezing the down-knee glute keeps you honest and level.'
      ]),

    E('plank_shoulder_tap', 'Plank Shoulder Tap', ['shoulder taps', 'plank taps'],
      ['abs'], ['obliques', 'front_delts'], 'bodyweight', 'core', 'isolation', 'beginner', [
        'Set up in a high plank with hands under shoulders and feet slightly wider than hip width.',
        'Brace, then lift one hand and tap the opposite shoulder without letting your hips sway or rotate.',
        'Place the hand back down quietly and tap with the other hand, alternating in a slow rhythm.',
        'Imagine a full cup of water on your lower back — nothing above the hips should tip it.'
      ], [
        'Wider feet make it easier, feet together makes it savage — adjust the stance, not the standard.'
      ]),

    E('side_plank_leg_lift', 'Side Plank with Leg Lift', ['side plank abduction', 'star plank progression'],
      ['obliques'], ['glutes', 'abs'], 'bodyweight', 'core', 'isolation', 'intermediate', [
        'Set up a strong side plank with your elbow under your shoulder and body in a straight line.',
        'Keeping the hips tall, raise the top leg to hip height or slightly above, exhaling.',
        'Hold the leg up for a one-count without letting the hips sag or roll.',
        'Lower the leg under control and repeat; switch sides after the set.'
      ], [
        'The bottom-side obliques and the top-side glute work together here — both matter for one-leg landings on trail runs.'
      ]),

    E('stir_the_pot', 'Stir the Pot', ['swiss ball plank circles', 'stability ball stir the pot'],
      ['abs'], ['obliques', 'front_delts'], 'other', 'core', 'isolation', 'intermediate', [
        'Set your forearms on a swiss ball in a plank position, feet on the floor slightly wider than hips.',
        'Brace hard and slowly draw small circles with your forearms, rolling the ball beneath them.',
        'Keep the hips and shoulders dead still — only the forearms travel.',
        'Do 5-8 circles one way, then reverse; widen the circles to progress.'
      ], [
        'A favorite of spine researchers: all the plank benefits plus movement, none of the back-bending.'
      ]),

    E('copenhagen_plank_short', 'Short-Lever Copenhagen Plank', ['bent knee copenhagen plank', 'copenhagen plank from knee'],
      ['adductors'], ['obliques', 'abs'], 'bodyweight', 'core', 'isolation', 'intermediate', [
        'Lie on your side below a bench and rest the top leg on it bent, with the inside of the knee on the pad.',
        'Place your forearm under your shoulder and lift your hips and bottom leg off the floor, exhaling.',
        'Form a straight line from knee to head, squeezing the top inner thigh down into the bench.',
        'Hold 10-20 seconds breathing steadily, lower with control, and switch sides.'
      ], [
        'The short lever (knee on the bench) is the right starting dose — earn the full straight-leg version over weeks.',
        'Mild inner-thigh burn is the goal; sharp groin pain means stop.'
      ]),

    /* ===== MOBILITY (V2) ===== */

    E('ankle_dorsiflexion_rock', 'Knee-to-Wall Ankle Rock', ['knee to wall', 'ankle dorsiflexion drill', 'ankle rocks'],
      ['calves'], [], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Kneel facing a wall with the front foot a hand-width away and its toes pointing at the wall.',
        'Keeping the front heel glued down, drive the knee forward over the toes to touch the wall.',
        'Rock back slightly, then drive forward again in a slow rhythm — 8-12 reps per side.',
        'When touching is easy, slide the foot back a thumb-width and repeat.'
      ], [
        'The heel lifting is the only way to fail this drill — less distance with a planted heel wins.',
        'Ankle range is squat depth and downhill-running insurance; measure your wall distance monthly.'
      ]),

    E('wall_calf_stretch', 'Wall Calf Stretch', ['gastroc stretch', 'straight knee calf stretch'],
      ['calves'], [], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Stand facing a wall with hands on it, one leg back with the knee straight and heel pressed into the floor.',
        'Point the back toes straight at the wall and lean your hips forward until the upper calf stretches.',
        'Hold 30-45 seconds, breathing slowly, keeping the back heel welded down.',
        'Switch legs; repeat 2-3 rounds per side.'
      ], [
        'Straight knee stretches the gastrocnemius — pair it with the bent-knee version so the soleus gets its share.'
      ]),

    E('bent_knee_calf_stretch', 'Bent-Knee Calf Stretch', ['soleus stretch', 'low calf stretch'],
      ['calves'], [], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Stand facing a wall in a short stagger stance, hands on the wall.',
        'Keep the back heel down and bend the back knee, sinking it toward the wall until the lower calf and ankle stretch.',
        'Hold 30-45 seconds breathing slowly, then switch legs.',
        'The stretch sits deeper and lower than the straight-knee version — near the Achilles.'
      ], [
        'Tight soleus steals ankle range first — rucking and hill running live in this stretch.'
      ]),

    E('downward_dog_pedal', 'Downward Dog Calf Pedal', ['down dog pedals', 'walking the dog'],
      ['calves'], ['hamstrings', 'lats'], 'bodyweight', 'mobility', 'compound', 'beginner', [
        'From a push-up position, push your hips high into an inverted V, hands pressing the floor away.',
        'Keeping the legs long, press one heel toward the floor while the other knee bends — feel the calf stretch.',
        'Alternate sides in a slow pedaling rhythm, breathing with each press.',
        'Pedal 8-12 times per side, keeping the back long and head relaxed.'
      ], [
        'A whole posterior chain in one drill — a perfect first move of any warm-up or cooldown.'
      ]),

    E('couch_stretch', 'Couch Stretch', ['wall quad stretch', 'rear foot elevated hip flexor stretch'],
      ['quads'], [], 'bodyweight', 'mobility', 'isolation', 'intermediate', [
        'Kneel with one shin vertical up a wall or couch back, that knee in the corner, and the other foot planted in front.',
        'Squeeze the rear-side glute and tuck your pelvis — this protects the lower back and aims the stretch.',
        'Raise your torso as upright as tolerable, feeling the stretch down the rear thigh and hip flexor.',
        'Breathe slowly for 30-60 seconds, then switch sides; ease up rather than arching the back.'
      ], [
        'The glute squeeze is non-negotiable — without it the lower back arches and eats the stretch.',
        'Brutal after long sitting or heavy squat days; a little daily beats a lot occasionally.'
      ]),

    E('half_kneeling_hip_flexor_stretch', 'Half-Kneeling Hip Flexor Stretch', ['kneeling lunge stretch', 'hip flexor stretch'],
      ['quads'], ['glutes'], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Kneel on one knee with the other foot planted forward, both knees near 90 degrees, torso tall.',
        'Squeeze the glute of the kneeling side and tuck the pelvis slightly under.',
        'Shift your whole body a few centimeters forward until the front of the kneeling hip stretches, not the lower back.',
        'Hold 30-45 seconds breathing slowly, then switch sides; raise the same-side arm overhead to deepen it.'
      ], [
        'Small shift, big stretch — lunging far forward just arches the spine and fakes it.'
      ]),

    E('worlds_greatest_stretch', 'World\'s Greatest Stretch', ['spiderman lunge with rotation', 'lunge with rotation'],
      ['adductors'], ['quads', 'glutes', 'upper_back'], 'bodyweight', 'mobility', 'compound', 'beginner', [
        'From a push-up position, step one foot outside the same-side hand into a deep lunge.',
        'Drop the opposite hand to the floor and sink the hips, feeling the groin and hip open.',
        'Rotate the lunge-side arm toward the ceiling, following the hand with your eyes, exhaling.',
        'Return the hand down, step back, and repeat on the other side; 4-6 slow reps per side.'
      ], [
        'Hips, groin, hamstrings, and T-spine in one move — the name is only half joking.',
        'Move between positions slowly; it is a mobility drill, not a burpee.'
      ]),

    E('pigeon_stretch', 'Pigeon Stretch', ['pigeon pose', 'figure four stretch'],
      ['glutes'], [], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'From all fours, bring one knee forward behind your wrist and lay that shin across the floor beneath you.',
        'Extend the other leg straight behind you, hips square and level to the floor.',
        'Fold your torso forward over the front shin as far as comfortable, breathing into the outer hip.',
        'Hold 45-60 seconds per side; do the lying figure-four version if the knee complains.'
      ], [
        'The hips must stay square — collapsing onto the front hip stretches nothing but patience.'
      ]),

    E('ninety_ninety_hip_switch', '90/90 Hip Switch', ['90 90 hip rotation', 'seated hip switch'],
      ['glutes'], ['adductors'], 'bodyweight', 'mobility', 'compound', 'beginner', [
        'Sit with one leg bent 90 degrees in front of you and the other bent 90 degrees to the side behind you.',
        'Sit tall and lean your chest over the front shin, breathing into the outer hip, for a few slow breaths.',
        'Lift both knees and rotate them together to the other side without using your hands, exhaling.',
        'Settle into the mirror position and lean again; switch slowly side to side 6-10 times.'
      ], [
        'The knees-floating switch is the strength part — hands-free transitions are the goal, not just the sit.'
      ]),

    E('frog_stretch', 'Frog Stretch', ['frog pose', 'groin stretch'],
      ['adductors'], [], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Start on all fours and slide both knees out wide, shins parallel and feet in line with the knees.',
        'Lower to your forearms with a flat back, hips pushed slightly back toward your heels.',
        'Sink until the inner thighs stretch, then breathe slowly for 30-60 seconds.',
        'Rock gently back and forth a few centimeters to explore the range — never bounce hard.'
      ], [
        'Pad the knees and go by feel — the groin rewards patience and punishes enthusiasm.'
      ]),

    E('deep_squat_hold', 'Deep Squat Hold', ['third world squat', 'squat prying'],
      ['adductors'], ['glutes', 'quads', 'calves'], 'bodyweight', 'mobility', 'compound', 'beginner', [
        'Stand with feet shoulder width, toes slightly out, and sink into the deepest squat you can with heels down.',
        'Rest your elbows inside your knees and press them gently outward, chest staying tall.',
        'Breathe slowly and shift weight side to side, letting the hips and ankles open.',
        'Accumulate 1-3 minutes total; hold a rack or door frame if the heels lift.'
      ], [
        'A counterweight held at the chest instantly fixes most balance problems and lets you sit deeper.',
        'A daily minute in the bottom does more for squat depth than any warm-up gadget.'
      ]),

    E('foam_roll_t_spine_extension', 'Foam Roller T-Spine Extension', ['thoracic extension on roller', 't-spine extension'],
      ['upper_back'], [], 'other', 'mobility', 'isolation', 'beginner', [
        'Lie on your back with a foam roller across your mid-back, knees bent, hands supporting your head.',
        'Keep the ribs down and extend your upper back over the roller, exhaling as you arch gently.',
        'Return to neutral, roll the roller one segment up or down, and repeat along the mid-back only.',
        'Spend 6-10 slow extensions across the region — never bridge over the lower back.'
      ], [
        'The bend must come from the stiff mid-back, not the already-bendy lower back — keep the ribs stacked.'
      ]),

    E('open_book_stretch', 'Open Book', ['side-lying thoracic rotation', 't-spine open book'],
      ['upper_back'], ['chest', 'obliques'], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Lie on your side with knees stacked and bent 90 degrees, both arms extended together on the floor in front of you.',
        'Keeping the knees glued down, sweep the top arm up and across to the other side like opening a book.',
        'Follow the hand with your eyes and let the chest rotate open, exhaling into the stretch.',
        'Pause for a breath, then close the book slowly; 6-10 reps per side.'
      ], [
        'The knees staying pinned is what forces the rotation into the T-spine instead of the lower back.'
      ]),

    E('thread_the_needle', 'Thread the Needle', ['quadruped thoracic rotation', 'needle threads'],
      ['upper_back'], ['obliques'], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Start on hands and knees with a flat back, wrists under shoulders.',
        'Slide one arm palm-up underneath your chest and across the floor, letting the shoulder and ear lower toward the mat.',
        'Follow the hand with your eyes as the upper back rotates, exhaling.',
        'Unthread and reach that same arm up toward the ceiling, opening the chest; 6-10 slow reps per side.'
      ], [
        'Sit the hips back toward the heels to lock the lower back out of the movement.'
      ]),

    E('cat_cow', 'Cat-Cow', ['cat camel', 'spinal flexion extension'],
      ['lower_back'], ['abs', 'upper_back'], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Start on hands and knees, wrists under shoulders, knees under hips.',
        'Exhale and round your whole spine toward the ceiling, tucking the tailbone and dropping the head — the cat.',
        'Inhale and reverse, letting the belly sink as the chest and tailbone lift — the cow.',
        'Flow slowly between the two for 8-12 breaths, moving segment by segment rather than all at once.'
      ], [
        'Gentle range, zero force — this is spinal lubrication for the morning and between heavy sets, not a stretch contest.'
      ]),

    E('wall_slide', 'Wall Slide', ['wall angel', 'shoulder wall slide'],
      ['upper_back'], ['side_delts', 'traps', 'front_delts'], 'bodyweight', 'mobility', 'isolation', 'beginner', [
        'Stand with your back, head, and hips against a wall, feet a step away, and press your forearms and wrists to the wall in a goalpost shape.',
        'Keeping ribs down and lower back close to the wall, slide the arms slowly overhead as far as contact allows.',
        'Pause where the wrists start to peel off, then drag the elbows back down toward your ribs, squeezing the shoulder blades.',
        'Do 8-12 slow reps — quality of contact beats height reached.'
      ], [
        'The moment the ribs flare or the wrists leave the wall, you have found your current range — work there, not past it.'
      ]),

    /* ===== SHOULDER/SCAP DURABILITY (V2) ===== */

    E('scapular_pull_up', 'Scapular Pull-Up', ['scap pull', 'scapular shrug'],
      ['traps'], ['lats', 'forearms'], 'bodyweight', 'pull', 'isolation', 'beginner', [
        'Hang from a pull-up bar with straight arms, hands shoulder width, feet off the floor.',
        'Without bending the elbows, pull your shoulder blades down and together so your chest rises a few centimeters.',
        'Hold the proud-chest top position for a one-count, exhaling.',
        'Release slowly back to a full passive hang and repeat for 6-12 controlled reps.'
      ], [
        'The first inch of every pull-up lives here — it is also the shoulder-saving antidote to dead-hang-only training.'
      ]),

    E('overhead_carry', 'Overhead Carry', ['waiter carry', 'overhead walk'],
      ['front_delts'], ['side_delts', 'traps', 'abs', 'forearms'], 'kettlebell', 'full_body', 'compound', 'intermediate', [
        'Press a kettlebell or dumbbell overhead and lock the elbow, knuckles toward the ceiling.',
        'Pull the ribs down and brace so the lower back does not arch under the load.',
        'Walk with short, controlled steps, keeping the weight stacked over shoulder and hip.',
        'Walk a set distance, lower the bell to the rack position with control, and switch arms.'
      ], [
        'The arm holds the weight, the core holds the arch — when the ribs flare, the set is over.',
        'Half the weight of your farmer carry is plenty to start.'
      ])
  ];

  /* ---------- index & API ---------- */

  const BY_ID = {};
  EXERCISES.forEach(function (x) { BY_ID[x.id] = x; });

  // V2: curated weekly durability checklist. Ordered; every id resolves via byId().
  // Slots: unilateral | calf_tib | grip | core (weekly compliance UI groups by slot).
  ExerciseDB.DURABILITY_CHECKLIST = [
    { id: 'split_squat', slot: 'unilateral' },
    { id: 'lateral_step_down', slot: 'unilateral' },
    { id: 'single_leg_rdl', slot: 'unilateral' },
    { id: 'single_leg_calf_raise', slot: 'calf_tib' },
    { id: 'tibialis_raise', slot: 'calf_tib' },
    { id: 'dead_hang', slot: 'grip' },
    { id: 'farmer_carry', slot: 'grip' },
    { id: 'pallof_press', slot: 'core' },
    { id: 'side_plank', slot: 'core' },
    { id: 'copenhagen_plank', slot: 'core' }
  ];

  function customList() {
    // Lazy read: Store loads after this file, so only touch it inside calls.
    const S = window.Store;
    if (!S || typeof S.customExercises !== 'function') return [];
    try { return S.customExercises() || []; } catch (e) { return []; }
  }

  ExerciseDB.all = function () {
    return EXERCISES.concat(customList());
  };

  ExerciseDB.byId = function (id) {
    if (!id) return null;
    if (BY_ID[id]) return BY_ID[id];
    const customs = customList();
    for (let i = 0; i < customs.length; i++) {
      if (customs[i].id === id) return customs[i];
    }
    return null;
  };

  // Match rank: 0 exact, 1 starts-with, 2 word-boundary, 3 substring, -1 none.
  // Best rank across the name and all aliases wins.
  function matchRank(q, ex) {
    let best = -1;
    const names = [ex.name].concat(ex.aliases || []);
    for (let i = 0; i < names.length; i++) {
      const s = String(names[i]).toLowerCase();
      let r = -1;
      if (s === q) r = 0;
      else if (s.indexOf(q) === 0) r = 1;
      else {
        const at = s.indexOf(q);
        if (at > 0 && !/[a-z0-9]/.test(s.charAt(at - 1))) r = 2;
        else if (at > 0) r = 3;
      }
      if (r >= 0 && (best < 0 || r < best)) best = r;
      if (best === 0) break;
    }
    return best;
  }

  ExerciseDB.search = function (q, filters) {
    filters = filters || {};
    const muscle = filters.muscle || null;
    const equipment = filters.equipment || null;
    const category = filters.category || null;

    let list = ExerciseDB.all().filter(function (ex) {
      if (muscle &&
          (ex.primaryMuscles || []).indexOf(muscle) < 0 &&
          (ex.secondaryMuscles || []).indexOf(muscle) < 0) return false;
      if (equipment && ex.equipment !== equipment) return false;
      if (category && ex.category !== category) return false;
      return true;
    });

    const query = String(q === null || q === undefined ? '' : q).trim().toLowerCase();
    if (!query) {
      return list.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    }

    const ranked = [];
    for (let i = 0; i < list.length; i++) {
      const r = matchRank(query, list[i]);
      if (r >= 0) ranked.push({ r: r, ex: list[i] });
    }
    ranked.sort(function (a, b) {
      return a.r - b.r || a.ex.name.localeCompare(b.ex.name);
    });
    return ranked.map(function (p) { return p.ex; });
  };

  window.ExerciseDB = ExerciseDB;
})();
